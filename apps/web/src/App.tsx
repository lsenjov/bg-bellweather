import {
  DISTRICTS,
  FIRMS_BY_ID,
  OPERATION_IDS,
  PARTIES,
  PARTIES_BY_ID,
  SCORING_CARDS_BY_ID,
  type FirmId,
  type OperationId,
  type PartyId,
  type ScoringCardId,
  type ScoringObjective
} from "@bellweather/content";
import type {
  GameCommand,
  OperationChoice,
  OperationResolutionChoice,
  ParticipantSession,
  ReplayResponse,
  ViewerStateEnvelope
} from "@bellweather/protocol";
import {
  replay as replayGame,
  type GameEvent,
  type GameState
} from "@bellweather/game";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ApiError,
  createLobby,
  getReplay,
  getState,
  joinLobby,
  sendCommand
} from "./api.js";
import { FIRM_ACCENTS, FirmEmblem } from "./FirmEmblem.js";
import { PartyEmblem } from "./PartyEmblem.js";

const SESSION_KEY = "bellweather-register-session";
const INVITE_KEY = "bellweather-register-invite";
interface ViewSeat {
  id: string;
  displayName: string;
  controller: "human" | "agent";
  position: number;
  firmIds: FirmId[];
  points: number;
  reserve: {
    leverage: number;
    bluff: number;
    operations: Record<OperationId, number>;
  } | null;
  scoringCardId: string | null;
}

interface GameView {
  playerCount: number;
  round: number;
  electionNumber: number;
  phase: string;
  phaseData: Record<string, unknown>;
  deadlineAt: number | null;
  nextFirstOpenerSeatId: string;
  seats: ViewSeat[];
  partyOrder: PartyId[];
  support: Record<string, Partial<Record<PartyId, number>>>;
  courtSupport: Record<PartyId, Partial<Record<PartyId, number>>>;
  coalitionTargets: Partial<Record<PartyId, PartyId | null>>;
  contests: Record<string, unknown>;
  bids: Array<Record<string, unknown>>;
  readySeatIds: string[];
  pendingDecision: Record<string, unknown> | null;
  counterbidSlots: Array<string | null>;
  electionHistory: Array<Record<string, unknown>>;
  chat: Array<{ id: string; seatId: string; text: string; sentAt: number }>;
}

export function App() {
  const [session, setSession] = useState<ParticipantSession | null>(() =>
    loadSession()
  );
  const [state, setState] = useState<ViewerStateEnvelope | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(() =>
    localStorage.getItem(INVITE_KEY)
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replayArchive, setReplayArchive] = useState<ReplayResponse | null>(
    null
  );
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (session === null) return;
    const sequence = ++refreshSequence.current;
    try {
      const nextState = await getState(session);
      if (sequence === refreshSequence.current) {
        setState(nextState);
        setError(null);
      }
    } catch (caught) {
      if (sequence === refreshSequence.current) {
        setError(messageOf(caught));
      }
    }
  }, [session]);

  useEffect(() => {
    if (session === null) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      await refresh();
      if (!cancelled) {
        timer = window.setTimeout(() => void poll(), 1_500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      refreshSequence.current += 1;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [refresh, session]);

  useEffect(() => {
    setReplayArchive(null);
  }, [session?.gameId]);

  const adoptSession = (
    nextSession: ParticipantSession,
    nextState: ViewerStateEnvelope,
    code?: string
  ) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    if (code !== undefined) {
      localStorage.setItem(INVITE_KEY, code);
    }
    setSession(nextSession);
    setState(nextState);
    setInviteCode(code ?? null);
  };

  const command = async (gameCommand: GameCommand) => {
    if (session === null || state === null) return;
    setBusy(true);
    setError(null);
    try {
      await sendCommand(session, gameCommand, state.publicState.version);
      await refresh();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  if (session === null) {
    return (
      <EntryDesk
        busy={busy}
        error={error}
        onBusy={setBusy}
        onError={setError}
        onCreate={(response) =>
          adoptSession(response.session, response.state, response.inviteCode)
        }
        onJoin={(response) => adoptSession(response.session, response.state)}
      />
    );
  }

  if (state === null) {
    return <LoadingDesk error={error} onLeave={() => leave(setSession)} />;
  }

  const view = extractView(state);
  const ownSeatId =
    session.participantType === "seat" ? session.seatId : undefined;
  const ownSeat = view?.seats.find((seat) => seat.id === ownSeatId);
  const host = state.publicState.seats.find((seat) => seat.role === "host");

  return (
    <div className="app-shell">
      <header className="masthead">
        <div>
          <p className="kicker">The Bellweather Register · Election Desk</p>
          <h1>Influence moves<br />before the morning edition.</h1>
        </div>
        <div className="edition-stamp">
          <span>{state.publicState.lifecycle}</span>
          <strong>{view ? `Round ${view.round} / 12` : "Lobby edition"}</strong>
          <small>{inviteCode ? `Invite ${inviteCode}` : state.publicState.gameId.slice(0, 8)}</small>
        </div>
      </header>

      <nav className="ticker" aria-label="Game status">
        <span>Players {state.publicState.seats.length}/{state.publicState.configuration.playerCount}</span>
        <span>Election {view?.electionNumber ?? 0}/3</span>
        <span>{timerCopy(view?.deadlineAt ?? null)}</span>
        <span>{state.publicState.configuration.counterbidTimer.mode === "off" ? "Readiness clock" : "Timed counterbids"}</span>
      </nav>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {state.publicState.lifecycle === "lobby" ? (
        <LobbyDesk
          state={state}
          session={session}
          hostSeatId={host?.seatId}
          inviteCode={inviteCode}
          busy={busy}
          onCommand={command}
        />
      ) : view ? (
        <GameDesk
          view={view}
          ownSeat={ownSeat}
          ownSeatId={ownSeatId}
          spectator={session.participantType === "spectator"}
          busy={busy}
          onCommand={command}
        />
      ) : (
        <section className="paper-panel waiting-copy">
          <p className="section-label">Wire service</p>
          <h2>The game feed is coming online.</h2>
          <p>The lobby is active, but the first projected dispatch has not arrived yet.</p>
        </section>
      )}

      {state.publicState.lifecycle === "completed" && (
        <section className="replay-strip">
          <div>
            <p className="section-label">Late edition</p>
            <h2>Full records are now unsealed.</h2>
          </div>
          <button
            className="ink-button"
            onClick={() =>
              void getReplay(session)
                .then(setReplayArchive)
                .catch((caught) => setError(messageOf(caught)))
            }
          >
            Open replay archive
          </button>
          {replayArchive !== null && (
            <strong>{replayArchive.events.length} recorded events</strong>
          )}
        </section>
      )}

      {replayArchive !== null && <ReplayArchiveView replay={replayArchive} />}

      <footer>
        <span>Ruleset {String(view?.round ? "1" : "awaiting game")}</span>
        <button className="text-button" onClick={() => leave(setSession)}>Leave this desk</button>
      </footer>
    </div>
  );
}

function EntryDesk(props: {
  busy: boolean;
  error: string | null;
  onBusy(value: boolean): void;
  onError(value: string | null): void;
  onCreate(response: Awaited<ReturnType<typeof createLobby>>): void;
  onJoin(response: Awaited<ReturnType<typeof joinLobby>>): void;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [players, setPlayers] = useState(4);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [spectators, setSpectators] = useState(true);
  const [role, setRole] = useState<"player" | "spectator">("player");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    props.onBusy(true);
    props.onError(null);
    try {
      if (mode === "create") {
        props.onCreate(
          await createLobby({
            displayName: name,
            controller: "human",
            configuration: {
              playerCount: players,
              counterbidTimer:
                !timerEnabled
                  ? { mode: "off" }
                  : { mode: "countdown", durationSeconds: timerSeconds },
              allowSpectators: spectators
            }
          })
        );
      } else {
        props.onJoin(
          await joinLobby({
            inviteCode: code.toUpperCase() as never,
            displayName: name,
            controller: "human",
            role
          })
        );
      }
    } catch (caught) {
      props.onError(messageOf(caught));
    } finally {
      props.onBusy(false);
    }
  };

  return (
    <main className="entry-page">
      <section className="entry-editorial">
        <p className="kicker">The Bellweather Register</p>
        <h1>Every whisper<br />leaves a mark.</h1>
        <p className="standfirst">A live election desk for rival lobbying houses, contested districts, and deals the record may never prove.</p>
        <div className="front-page-rule"><span>12 rounds</span><span>3 elections</span><span>Unlimited support</span></div>
      </section>
      <section className="entry-form paper-panel">
        <div className="tab-row" role="tablist">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Open a table</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>Join by code</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>Byline<input required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your display name" /></label>
          {mode === "create" ? (
            <>
              <label>Seats<select value={players} onChange={(event) => setPlayers(Number(event.target.value))}>{[2,3,4,5,6].map((count) => <option key={count}>{count}</option>)}</select></label>
              <label>Counterbid seconds<input type="number" min="5" max="3600" disabled={!timerEnabled} value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value))} /></label>
              <label className="check-line"><input type="checkbox" checked={!timerEnabled} onChange={(event) => setTimerEnabled(!event.target.checked)} /> Disable timer — unanimous ready only</label>
              <label className="check-line"><input type="checkbox" checked={spectators} onChange={(event) => setSpectators(event.target.checked)} /> Admit observers</label>
            </>
          ) : (
            <>
              <label>Invitation code<input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="REGISTER8" autoCapitalize="characters" /></label>
              <label>Desk<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="player">Player</option><option value="spectator">Observer</option></select></label>
            </>
          )}
          {props.error && <p className="form-error" role="alert">{props.error}</p>}
          <button className="red-button" disabled={props.busy}>{props.busy ? "Sending…" : mode === "create" ? "Print first edition" : "Enter the newsroom"}</button>
        </form>
      </section>
    </main>
  );
}

function LobbyDesk(props: {
  state: ViewerStateEnvelope;
  session: ParticipantSession;
  hostSeatId: string | undefined;
  inviteCode: string | null;
  busy: boolean;
  onCommand(command: GameCommand): Promise<void>;
}) {
  const seatId = props.session.participantType === "seat" ? props.session.seatId : undefined;
  const self = props.state.publicState.seats.find((seat) => seat.seatId === seatId);
  const full = props.state.publicState.seats.length === props.state.publicState.configuration.playerCount;
  return (
    <main className="lobby-layout">
      <section className="paper-panel lobby-call">
        <p className="section-label">Invitation wire</p>
        <h2>{props.inviteCode ?? "Lobby open"}</h2>
        <p>Share the code. Player seats close once the presses start.</p>
        <div className="seat-list">
          {props.state.publicState.seats.map((seat) => (
            <article key={seat.seatId}>
              <span className={`status-dot ${seat.ready ? "ready" : ""}`} />
              <div><strong>{seat.displayName}</strong><small>{seat.role} · {seat.controller}</small></div>
              <b>{seat.ready ? "Filed" : "At desk"}</b>
            </article>
          ))}
          {Array.from({ length: props.state.publicState.configuration.playerCount - props.state.publicState.seats.length }, (_, index) => (
            <article className="empty-seat" key={index}><span className="status-dot" /><div><strong>Open desk</strong><small>Awaiting correspondent</small></div></article>
          ))}
        </div>
        {seatId && (
          <button className="ink-button" disabled={props.busy} onClick={() => props.onCommand({ type: "set_lobby_ready", ready: !self?.ready })}>
            {self?.ready ? "Withdraw filing" : "Mark ready"}
          </button>
        )}
        {seatId === props.hostSeatId && (
          <button className="red-button" disabled={props.busy || !full} onClick={() => props.onCommand({ type: "start_game" })}>
            {full ? "Start the presses" : "Waiting for every seat"}
          </button>
        )}
      </section>
      <aside className="briefing paper-panel">
        <p className="section-label">Editor’s briefing</p>
        <h3>Tonight’s conditions</h3>
        <dl><div><dt>Players</dt><dd>{props.state.publicState.configuration.playerCount}</dd></div><div><dt>Counterbids</dt><dd>{props.state.publicState.configuration.counterbidTimer.mode === "off" ? "Readiness" : `${props.state.publicState.configuration.counterbidTimer.durationSeconds}s`}</dd></div><div><dt>Observers</dt><dd>{props.state.publicState.configuration.allowSpectators ? "Admitted" : "Closed"}</dd></div></dl>
      </aside>
    </main>
  );
}

function GameDesk(props: {
  view: GameView;
  ownSeat: ViewSeat | undefined;
  ownSeatId: string | undefined;
  spectator: boolean;
  busy: boolean;
  onCommand(command: GameCommand): Promise<void>;
}) {
  const [chat, setChat] = useState("");
  const [giftTo, setGiftTo] = useState("");
  const [gift, setGift] = useState({ leverage: 0, bluff: 0, points: 0, organise: 0, rally: 0, smear: 0, court: 0 });
  const [openingPartyIntent, setOpeningPartyIntent] = useState<SelectionIntent<PartyId> | null>(null);
  const [openingDraftSummary, setOpeningDraftSummary] = useState<OpeningDraftSummary>({
    activePartyId: null,
    assignedPartyIds: []
  });
  const [counterbidContestIntent, setCounterbidContestIntent] = useState<SelectionIntent<string> | null>(null);
  const [counterbidDraftSummary, setCounterbidDraftSummary] = useState<CounterbidDraftSummary>({
    contestId: null,
    slotIndex: 0,
    placed: false,
    dirty: false
  });
  const ownReady = props.ownSeatId ? props.view.readySeatIds.includes(props.ownSeatId) : false;
  const scoringCard = props.ownSeat?.scoringCardId ? SCORING_CARDS_BY_ID[props.ownSeat.scoringCardId as keyof typeof SCORING_CARDS_BY_ID] : undefined;
  const latestElection = props.view.electionHistory.at(-1);
  const revealedObjectives = revealedElectionObjectives(
    props.view.phase,
    latestElection
  );
  const scoringObjectives = revealedObjectives.length > 0
    ? revealedObjectives
    : scoringCard?.objectives;
  const activeOpening =
    props.ownSeatId !== undefined &&
    props.view.phase === "opening" &&
    props.view.phaseData.activeSeatId === props.ownSeatId;
  const chooseOpeningParty = useCallback((partyId: PartyId) => {
    setOpeningPartyIntent((current) => ({
      value: partyId,
      revision: (current?.revision ?? 0) + 1
    }));
  }, []);
  const chooseCounterbidContest = useCallback((contestId: string) => {
    setCounterbidContestIntent((current) => ({
      value: contestId,
      revision: (current?.revision ?? 0) + 1
    }));
  }, []);
  const canTargetCounterbid =
    props.view.phase === "counterbidding" &&
    !props.spectator &&
    props.ownSeat !== undefined;
  const folioFirmId = props.ownSeat?.firmIds[0];
  const folioStyle = folioFirmId
    ? {
        "--folio-firm": FIRM_ACCENTS[folioFirmId]
      } as React.CSSProperties
    : undefined;
  const contestIds = orderedContestIds(
    props.view.contests,
    props.view.partyOrder
  );

  return (
    <main className="game-grid">
      <aside
        className={`private-folio paper-panel ${folioFirmId ? "private-folio-firm" : "private-folio-neutral"}`}
        style={folioStyle}
      >
        {folioFirmId && (
          <div className="folio-watermarks" aria-hidden="true">
            <FirmEmblem firmId={folioFirmId} />
          </div>
        )}
        <div className="folio-heading">
          <p className="section-label">{props.spectator ? "Observer’s copy" : "Private folio"}</p>
          <h2>{props.ownSeat?.displayName ?? "Press gallery"}</h2>
          {props.ownSeat?.reserve && (
            <p className="firm-line">{folioFirmId ? FIRMS_BY_ID[folioFirmId].name : ""}</p>
          )}
        </div>
        {props.ownSeat?.reserve ? (
          <>
            <div className="folio-inventory">
              <div className="folio-metric folio-points"><span>Points</span><strong>{props.ownSeat.points}</strong></div>
              <div className="folio-metric"><span>Leverage</span><strong>{props.ownSeat.reserve.leverage}</strong></div>
              <div className="folio-metric"><span>Bluff</span><strong>{props.ownSeat.reserve.bluff}</strong></div>
              {OPERATION_IDS.map((operation) => (
                <div className="folio-metric" key={operation}>
                  <span>{operation}</span>
                  <strong>{props.ownSeat!.reserve!.operations[operation]}</strong>
                </div>
              ))}
            </div>
            <div className="agenda folio-agenda">
              <span>Hidden election brief</span>
              <strong>{scoringCard?.id ?? props.ownSeat.scoringCardId ?? "Sealed"}</strong>
              {scoringCard?.objectives.map((objective) => <small key={objective.districtId}>{objective.districtId} · {PARTIES_BY_ID[objective.partyId].shortName}</small>)}
            </div>
          </>
        ) : <p className="folio-public-copy">Public information only. Private reserves remain behind the screen.</p>}
      </aside>

      <section className="map-desk paper-panel">
        <div className="section-heading"><div><p className="section-label">District returns</p><h2>The Crownwater map</h2></div><div className="phase-slug">{props.view.phase}</div></div>
        <PartyRail
          view={props.view}
          {...(activeOpening ? {
            interaction: {
              activePartyId: openingDraftSummary.activePartyId,
              assignedPartyIds: openingDraftSummary.assignedPartyIds,
              onSelect: chooseOpeningParty
            }
          } : {})}
        />
        <DistrictMap
          support={props.view.support}
          scoringObjectives={scoringObjectives}
          scoringLabel={revealedObjectives.length > 0 ? "Election agenda" : "Private agenda"}
        />
        <PlayerLedger
          seats={props.view.seats}
          readySeatIds={props.view.readySeatIds}
          showReadiness={
            props.view.phase === "counterbidding" || props.view.phase === "election"
          }
        />
      </section>

      <section className="contest-desk paper-panel">
        <div className="section-heading"><div><p className="section-label">Influence book</p><h2>Contests & filings</h2></div><b>Phase: {props.view.phase}</b></div>
        <div className="contest-list">
          {contestIds.length === 0 ? (
            <p className="empty-copy">No party contest has been opened.</p>
          ) : (
            contestIds.map((id) => (
              <ContestCard
                key={id}
                contestId={id}
                bids={props.view.bids.filter((bid) => bid.contestId === id)}
                seats={props.view.seats}
                {...(canTargetCounterbid ? {
                  selected: counterbidDraftSummary.contestId === id,
                  onSelect: chooseCounterbidContest
                } : {})}
              />
            ))
          )}
        </div>
        {!props.spectator && props.ownSeat && props.ownSeatId && (
          <ActionDesk
            view={props.view}
            seat={props.ownSeat}
            seatId={props.ownSeatId}
            busy={props.busy}
            ownReady={ownReady}
            openingPartyIntent={openingPartyIntent}
            onOpeningDraftChange={setOpeningDraftSummary}
            counterbidContestIntent={counterbidContestIntent}
            counterbidDraftSummary={counterbidDraftSummary}
            onCounterbidDraftChange={setCounterbidDraftSummary}
            onCommand={props.onCommand}
          />
        )}
      </section>

      {latestElection && (
        <ElectionDesk election={latestElection} seats={props.view.seats} />
      )}

      <section className="back-channel-desk paper-panel">
        <div className="section-heading">
          <div><p className="section-label">Back channel</p><h2>Gifts & table talk</h2></div>
        </div>
        <div className="back-channel-grid">
          <section className="deal-desk">
            <p className="section-label">Private transfer</p>
            <h3>Gift ledger</h3>
            {!props.spectator && props.ownSeatId ? (
              <form onSubmit={(event) => {
                event.preventDefault();
                void props.onCommand({ type: "give_resources", recipientSeatId: giftTo as never, leverage: gift.leverage, bluff: gift.bluff, points: gift.points, operations: { organise: gift.organise, rally: gift.rally, smear: gift.smear, court: gift.court } });
              }}>
                <label>Recipient<select required value={giftTo} onChange={(event) => setGiftTo(event.target.value)}><option value="">Choose a player</option>{props.view.seats.filter((seat) => seat.id !== props.ownSeatId).map((seat) => <option key={seat.id} value={seat.id}>{seat.displayName}</option>)}</select></label>
                <div className="gift-grid">{(["leverage","bluff","points","organise","rally","smear","court"] as const).map((key) => <label key={key}>{key}<input type="number" min="0" value={gift[key]} onChange={(event) => setGift({ ...gift, [key]: Number(event.target.value) })} /></label>)}</div>
                <button className="ink-button">Record one-way gift</button>
              </form>
            ) : <p>Observers cannot move table resources.</p>}
          </section>

          <section className="chat-desk">
            <p className="section-label">Public wire</p>
            <h3>Table talk</h3>
            <div className="chat-log" aria-live="polite">{props.view.chat.length === 0 ? <p>No statements on record.</p> : props.view.chat.map((message) => <article key={message.id}><b>{props.view.seats.find((seat) => seat.id === message.seatId)?.displayName ?? "Desk"}</b><p>{message.text}</p></article>)}</div>
            {!props.spectator && <form className="chat-form" onSubmit={(event) => { event.preventDefault(); if (chat.trim()) void props.onCommand({ type: "post_chat", message: chat }).then(() => setChat("")); }}><input aria-label="Public chat message" value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Put a statement on the record…" /><button className="red-button">Send</button></form>}
          </section>
        </div>
      </section>
    </main>
  );
}

type TokenDraft = Record<OperationId, number>;

interface SelectionIntent<T> {
  value: T;
  revision: number;
}

interface OpeningDraftSummary {
  activePartyId: PartyId | null;
  assignedPartyIds: PartyId[];
}

interface CounterbidDraftSummary {
  contestId: string | null;
  slotIndex: number;
  placed: boolean;
  dirty: boolean;
}

const EMPTY_TOKENS: TokenDraft = {
  organise: 0,
  rally: 0,
  smear: 0,
  court: 0
};

const CARD_FAMILY_LABELS: Record<
  "leverage" | "bluff" | OperationId,
  { initial: string; name: string }
> = {
  leverage: { initial: "L", name: "Leverage" },
  bluff: { initial: "B", name: "Bluff" },
  organise: { initial: "O", name: "Organise" },
  rally: { initial: "R", name: "Rally" },
  smear: { initial: "S", name: "Smear" },
  court: { initial: "C", name: "Court" }
};

export function ContestCard(props: {
  contestId: string;
  bids: Array<Record<string, unknown>>;
  seats: ViewSeat[];
  selected?: boolean;
  onSelect?(contestId: string): void;
}) {
  const contestParty = PARTIES.find((party) => party.id === props.contestId);
  const ranked = [...props.bids].sort((left, right) => {
    const leftLeverage = typeof left.leverage === "number" ? left.leverage : -1;
    const rightLeverage = typeof right.leverage === "number" ? right.leverage : -1;
    return rightLeverage - leftLeverage;
  });
  const heading = (
    <>
      <strong>{partyName(props.contestId)}</strong>
      <span>{ranked.length} {ranked.length === 1 ? "bid" : "bids"}</span>
    </>
  );
  return (
    <article
      className={`contest-card ${contestParty ? "contest-card-party" : "contest-card-neutral"} ${props.selected ? "contest-card-selected" : ""}`}
      style={contestParty ? {
        "--contest-party": contestParty.color
      } as React.CSSProperties : undefined}
    >
      {props.onSelect ? (
        <button
          type="button"
          className="contest-target-button"
          aria-label={`Target ${partyName(props.contestId)} with a counterbid`}
          aria-pressed={props.selected ?? false}
          onClick={() => props.onSelect?.(props.contestId)}
        >
          {heading}
        </button>
      ) : <header>{heading}</header>}
      <ol>
        {ranked.map((bid, index) => {
          const operationInventory = isObject(bid.operations)
            ? bid.operations
            : null;
          const cardFamilies = [
            ...(typeof bid.leverage === "number"
              ? [{ family: "leverage" as const, count: bid.leverage }]
              : []),
            ...(typeof bid.bluff === "number"
              ? [{ family: "bluff" as const, count: bid.bluff }]
              : []),
            ...(operationInventory
              ? OPERATION_IDS.map((operation) => ({
                  family: operation,
                  count: numberOr(operationInventory[operation], 0)
                }))
              : [])
          ].filter((entry) => entry.count > 0);
          const cardSummaryLabel = cardFamilies
            .map(
              ({ family, count }) =>
                `${count} ${CARD_FAMILY_LABELS[family].name}`
            )
            .join(", ");
          const owner = props.seats.find((seat) => seat.id === bid.ownerSeatId);
          const recipient = props.seats.find(
            (seat) => seat.id === bid.transferredToSeatId
          );
          const leverageKnown = typeof bid.leverage === "number";
          const cardCount = numberOr(bid.cardCount, 0);
          const firmId = owner?.firmIds[0] ?? String(bid.firmId) as FirmId;
          const firm = FIRMS_BY_ID[firmId];
          return (
            <li
              key={String(bid.id)}
              className={`bid-line bid-${String(bid.status ?? "active")}`}
              style={firm ? {
                "--firm-accent": FIRM_ACCENTS[firmId]
              } as React.CSSProperties : undefined}
            >
              {firm && (
                <FirmEmblem
                  firmId={firmId}
                  className="filing-firm-emblem"
                />
              )}
              <div>
                <b>{leverageKnown ? `#${index + 1} · ` : ""}{owner?.displayName ?? "Unknown firm"}</b>
                <small>
                  {firm?.name ?? String(bid.firmId)} · {String(bid.kind)}
                  {typeof bid.slotIndex === "number"
                    ? " · identity card"
                    : ""} · {String(bid.status ?? "covered")}
                </small>
              </div>
              {cardFamilies.length > 0 && (
                <strong className="filing-cards" aria-label={cardSummaryLabel}>
                  {cardFamilies.map(({ family, count }) => (
                    <span className="filing-card-token" key={family}>
                      {count} {CARD_FAMILY_LABELS[family].initial}
                    </span>
                  ))}
                </strong>
              )}
              {cardFamilies.length === 0 && !leverageKnown && (
                <strong className="filing-covered">Covered</strong>
              )}
              {cardCount > 0 && (
                <span className="filing-total">
                  {cardCount} bid {cardCount === 1 ? "card" : "cards"} in stack
                </span>
              )}
              {recipient && <em>Transferred to {recipient.displayName}</em>}
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function ActionDesk(props: {
  view: GameView;
  seat: ViewSeat;
  seatId: string;
  busy: boolean;
  ownReady: boolean;
  openingPartyIntent: SelectionIntent<PartyId> | null;
  onOpeningDraftChange(summary: OpeningDraftSummary): void;
  counterbidContestIntent: SelectionIntent<string> | null;
  counterbidDraftSummary: CounterbidDraftSummary;
  onCounterbidDraftChange(summary: CounterbidDraftSummary): void;
  onCommand(command: GameCommand): Promise<void>;
}) {
  const phase = props.view.phase;
  const publicPhase = props.view.pendingDecision;
  const activeOpening =
    phase === "opening" &&
    props.view.phaseData.activeSeatId === props.seatId;

  return (
    <div className="action-compose">
      <p className="section-label">Your filing desk</p>
      {phase === "opening" && (
        activeOpening ? (
          <OpeningForm
            {...props}
            partySelection={props.openingPartyIntent}
            onDraftStateChange={props.onOpeningDraftChange}
          />
        ) : (
          <p className="empty-copy">Another firm is placing its opening bid.</p>
        )
      )}
      {phase === "counterbidding" && (
        <>
          <CounterbidForm
            {...props}
            contestSelection={props.counterbidContestIntent}
            onDraftStateChange={props.onCounterbidDraftChange}
          />
          {!props.ownReady && props.counterbidDraftSummary.dirty && (
            <p className="selection-feedback" role="status">
              Apply or reset the current counterbid edits before locking.
            </p>
          )}
          <button
            className="red-button"
            disabled={
              props.busy ||
              (!props.ownReady && props.counterbidDraftSummary.dirty)
            }
            onClick={() =>
              props.onCommand({
                type: "game_action",
                action: {
                  type: "set_counterbid_ready",
                  ready: !props.ownReady
                }
              })
            }
          >
            {props.ownReady ? "Unready & revise" : "Lock counterbids"}
          </button>
        </>
      )}
      {phase === "resolution" && (
        publicPhase ? (
          <DecisionForm {...props} decision={publicPhase} />
        ) : (
          <p className="empty-copy">The table is waiting on another firm’s decision.</p>
        )
      )}
      {phase === "election" && (
        <div className="phase-form">
          <h3>Election Day is on the record</h3>
          <p>Review the bulletin, make any gifts, then mark this desk ready.</p>
          <button
            className="red-button"
            disabled={props.busy}
            onClick={() =>
              props.onCommand({
                type: "game_action",
                action: {
                  type: "set_election_ready",
                  ready: !props.ownReady
                }
              })
            }
          >
            {props.ownReady ? "Withdraw Election ready" : "Ready for the next edition"}
          </button>
        </div>
      )}
      {phase === "complete" && <p>The final edition is on the record.</p>}
    </div>
  );
}

export function OpeningForm(props: {
  view: GameView;
  seat: ViewSeat;
  busy: boolean;
  partySelection?: SelectionIntent<PartyId> | null;
  onDraftStateChange?(summary: OpeningDraftSummary): void;
  onCommand(command: GameCommand): Promise<void>;
}) {
  const availableParties = useMemo(
    () => PARTIES.map((party) => party.id).filter(
      (partyId) => !(partyId in props.view.contests)
    ),
    [props.view.contests]
  );
  const required = Math.min(
    props.view.playerCount <= 3 ? 2 : 1,
    props.seat.reserve?.leverage ?? 0,
    availableParties.length
  );
  const [rows, setRows] = useState<Array<{
    firmId: FirmId;
    partyId: PartyId;
    leverage: number;
    bluff: number;
    operations: TokenDraft;
  }>>(() =>
    Array.from({ length: required }, (_, index) => ({
      firmId: props.seat.firmIds[index] ?? props.seat.firmIds[0]!,
      partyId: availableParties[index] ?? availableParties[0] ?? "honeycomb",
      leverage: 1,
      bluff: 0,
      operations: { ...EMPTY_TOKENS }
    }))
  );
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const lastPartySelectionRevision = useRef(
    props.partySelection?.revision ?? 0
  );
  const reserve = props.seat.reserve ?? {
    leverage: 0,
    bluff: 0,
    operations: { ...EMPTY_TOKENS }
  };

  const updateRow = (
    index: number,
    update: Partial<(typeof rows)[number]>
  ) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...update } : row
      )
    );
  };

  useEffect(() => {
    props.onDraftStateChange?.({
      activePartyId: rows[activeRowIndex]?.partyId ?? null,
      assignedPartyIds: rows.map((row) => row.partyId)
    });
  }, [activeRowIndex, props.onDraftStateChange, rows]);

  useEffect(() => {
    const selection = props.partySelection;
    if (
      selection === null ||
      selection === undefined ||
      selection.revision === lastPartySelectionRevision.current
    ) {
      return;
    }
    lastPartySelectionRevision.current = selection.revision;
    if (!availableParties.includes(selection.value)) {
      return;
    }
    setRows((current) => {
      const assignedElsewhere = current.some(
        (row, index) => index !== activeRowIndex && row.partyId === selection.value
      );
      if (assignedElsewhere || current[activeRowIndex]?.partyId === selection.value) {
        return current;
      }
      return current.map((row, index) =>
        index === activeRowIndex ? { ...row, partyId: selection.value } : row
      );
    });
  }, [activeRowIndex, availableParties, props.partySelection]);

  return (
    <form
      className="phase-form"
      onSubmit={(event) => {
        event.preventDefault();
        void props.onCommand({
          type: "game_action",
          action: { type: "submit_openings", openings: rows }
        });
      }}
    >
      <h3>
        Place {required} opening {required === 1 ? "bid" : "bids"}
        {props.seat.firmIds[0]
          ? ` as ${FIRMS_BY_ID[props.seat.firmIds[0]].name}`
          : ""}
      </h3>
      {rows.map((row, index) => {
        const leverageMaximum = reserve.leverage - rows.reduce(
          (total, candidate, candidateIndex) =>
            total + (candidateIndex === index ? 0 : candidate.leverage),
          0
        );
        const bluffMaximum = reserve.bluff - rows.reduce(
          (total, candidate, candidateIndex) =>
            total + (candidateIndex === index ? 0 : candidate.bluff),
          0
        );
        const operationMaximums = Object.fromEntries(
          OPERATION_IDS.map((operation) => [
            operation,
            reserve.operations[operation] - rows.reduce(
              (total, candidate, candidateIndex) =>
                total + (candidateIndex === index ? 0 : candidate.operations[operation]),
              0
            )
          ])
        ) as TokenDraft;

        return <fieldset
          className={`opening-draft ${index === activeRowIndex ? "opening-draft-active" : ""}`}
          key={index}
          onFocus={() => setActiveRowIndex(index)}
        >
          <legend>
            <button
              type="button"
              className="draft-selector"
              aria-pressed={index === activeRowIndex}
              onClick={() => setActiveRowIndex(index)}
            >
              Edit opening {index + 1}
            </button>
          </legend>
          <label>
            Party
            <select
              value={row.partyId}
              onChange={(event) => {
                setActiveRowIndex(index);
                updateRow(index, { partyId: event.target.value as PartyId });
              }}
            >
              {availableParties.map((partyId) => (
                <option
                  key={partyId}
                  value={partyId}
                  disabled={rows.some(
                    (candidate, candidateIndex) =>
                      candidateIndex !== index && candidate.partyId === partyId
                  )}
                >
                  {PARTIES_BY_ID[partyId].name}
                </option>
              ))}
            </select>
          </label>
          <CardCountSelect
            label="Leverage"
            minimum={1}
            maximum={leverageMaximum}
            value={row.leverage}
            onChange={(leverage) => updateRow(index, { leverage })}
          />
          <CardCountSelect
            label="Face-down Bluff"
            maximum={bluffMaximum}
            value={row.bluff}
            onChange={(bluff) => updateRow(index, { bluff })}
          />
          <TokenFields
            value={row.operations}
            maximums={operationMaximums}
            onChange={(operations) => updateRow(index, { operations })}
          />
        </fieldset>;
      })}
      <button className="ink-button" disabled={props.busy}>
        File opening {required === 1 ? "bid" : "bids"}
      </button>
    </form>
  );
}

export function CounterbidForm(props: {
  view: GameView;
  seat: ViewSeat;
  busy: boolean;
  contestSelection?: SelectionIntent<string> | null;
  onDraftStateChange?(summary: CounterbidDraftSummary): void;
  onCommand(command: GameCommand): Promise<void>;
}) {
  const contestIds = orderedContestIds(
    props.view.contests,
    props.view.partyOrder
  );
  const defaultContestId = contestIds[0] ?? "pecking-order";
  const [slotIndex, setSlotIndex] = useState(0);
  const [contestId, setContestId] = useState(defaultContestId);
  const [leverage, setLeverage] = useState(0);
  const [bluff, setBluff] = useState(0);
  const [operations, setOperations] = useState<TokenDraft>({
    ...EMPTY_TOKENS
  });
  const [selectionFeedback, setSelectionFeedback] = useState<string | null>(null);
  const lastContestSelectionRevision = useRef(
    props.contestSelection?.revision ?? 0
  );
  const slots = useMemo(
    () => props.view.counterbidSlots.length > 0
      ? props.view.counterbidSlots
      : Array.from({ length: props.seat.firmIds.length * 2 }, () => null),
    [props.seat.firmIds.length, props.view.counterbidSlots]
  );
  const firmId =
    props.seat.firmIds[Math.floor(slotIndex / 2)] ??
    props.seat.firmIds[0] ??
    "";
  const selectedBidId = slots[slotIndex];
  const selectedBid = props.view.bids.find(
    (candidate) => candidate.id === selectedBidId
  );
  const returnedOperations = objectValue(selectedBid?.operations);
  const maximums = {
    leverage:
      (props.seat.reserve?.leverage ?? 0) + numberOr(selectedBid?.leverage, 0),
    bluff:
      (props.seat.reserve?.bluff ?? 0) + numberOr(selectedBid?.bluff, 0),
    operations: Object.fromEntries(
      OPERATION_IDS.map((operation) => [
        operation,
        (props.seat.reserve?.operations[operation] ?? 0) +
          numberOr(returnedOperations[operation], 0)
      ])
    ) as TokenDraft
  };
  const persistedOperations = objectValue(selectedBid?.operations);
  const dirty = selectedBid === undefined
    ? contestId !== defaultContestId ||
      leverage > 0 ||
      bluff > 0 ||
      OPERATION_IDS.some((operation) => operations[operation] > 0)
    : contestId !== String(selectedBid.contestId) ||
      leverage !== numberOr(selectedBid.leverage, 0) ||
      bluff !== numberOr(selectedBid.bluff, 0) ||
      OPERATION_IDS.some(
        (operation) => operations[operation] !== numberOr(persistedOperations[operation], 0)
      );

  const hydrateSelectedSlot = () => {
    if (selectedBidId === null || selectedBidId === undefined) {
      setLeverage(0);
      setBluff(0);
      setOperations({ ...EMPTY_TOKENS });
      return;
    }
    if (selectedBid === undefined) {
      return;
    }
    if (typeof selectedBid.contestId === "string") {
      setContestId(selectedBid.contestId);
    }
    setLeverage(numberOr(selectedBid.leverage, 0));
    setBluff(numberOr(selectedBid.bluff, 0));
    setOperations({
      organise: numberOr(persistedOperations.organise, 0),
      rally: numberOr(persistedOperations.rally, 0),
      smear: numberOr(persistedOperations.smear, 0),
      court: numberOr(persistedOperations.court, 0)
    });
  };

  useEffect(() => {
    hydrateSelectedSlot();
  }, [selectedBidId, slotIndex]);

  useEffect(() => {
    props.onDraftStateChange?.({
      contestId,
      slotIndex,
      placed: selectedBidId !== null && selectedBidId !== undefined,
      dirty
    });
  }, [contestId, dirty, props.onDraftStateChange, selectedBidId, slotIndex]);

  useEffect(() => {
    const selection = props.contestSelection;
    if (
      selection === null ||
      selection === undefined ||
      selection.revision === lastContestSelectionRevision.current
    ) {
      return;
    }
    lastContestSelectionRevision.current = selection.revision;
    if (!(selection.value in props.view.contests)) {
      setSelectionFeedback("That contest is no longer available.");
      return;
    }
    if (selection.value === contestId) {
      setSelectionFeedback(null);
      return;
    }
    if (selectedBidId === null || selectedBidId === undefined) {
      setContestId(selection.value);
      setSelectionFeedback(`Unused counterbid retargeted to ${partyName(selection.value)}.`);
      return;
    }
    if (dirty) {
      setSelectionFeedback("Apply or reset the unsaved edits before choosing another contest.");
      return;
    }
    const unusedSlotIndex = slots.findIndex((bidId) => bidId === null);
    if (unusedSlotIndex === -1) {
      setSelectionFeedback("No unused counterbid is available; the placed bid was not changed.");
      return;
    }
    setSlotIndex(unusedSlotIndex);
    setContestId(selection.value);
    setSelectionFeedback(
      `Unused counterbid ${unusedSlotIndex + 1} selected for ${partyName(selection.value)}.`
    );
  }, [contestId, dirty, props.contestSelection, props.view.contests, selectedBidId, slots]);

  const send = (bid: Record<string, unknown> | null) =>
    props.onCommand({
      type: "game_action",
      action: { type: "set_counterbid", slotIndex, bid: bid as never }
    });

  return (
    <form
      className="phase-form"
      onSubmit={(event) => {
        event.preventDefault();
        void send({ contestId, firmId, leverage, bluff, operations });
      }}
    >
      <h3>Counterbids</h3>
      <label>
        Counterbid card
        <select
          value={slotIndex}
          onChange={(event) => {
            const nextSlotIndex = Number(event.target.value);
            if (nextSlotIndex === slotIndex) {
              return;
            }
            if (dirty) {
              setSelectionFeedback("Apply or reset the unsaved edits before changing identity cards.");
              return;
            }
            setSelectionFeedback(null);
            setSlotIndex(nextSlotIndex);
          }}
        >
          {slots.map((bidId, index) => (
            <option key={index} value={index}>
              {props.seat.firmIds[0]
                ? FIRMS_BY_ID[props.seat.firmIds[0]].numeral
                : "Firm"}{" "}
              · counterbid {index + 1}
              {bidId ? " · placed" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Contest
        <select
          value={contestId}
          onChange={(event) => {
            setContestId(event.target.value);
            setSelectionFeedback(null);
          }}
        >
          {contestIds.map((id) => (
            <option key={id} value={id}>{partyName(id)}</option>
          ))}
        </select>
      </label>
      <CardCountSelect
        label="Hidden Leverage"
        maximum={maximums.leverage}
        value={leverage}
        onChange={setLeverage}
      />
      <CardCountSelect
        label="Hidden Bluff"
        maximum={maximums.bluff}
        value={bluff}
        onChange={setBluff}
      />
      <TokenFields
        value={operations}
        maximums={maximums.operations}
        onChange={setOperations}
      />
      {selectionFeedback && <p className="selection-feedback" role="status">{selectionFeedback}</p>}
      <div className="form-actions">
        <button className="ink-button" disabled={props.busy}>
          Place / replace counterbid
        </button>
        <button
          type="button"
          className="text-button"
          disabled={props.busy || slots[slotIndex] === null}
          onClick={() => void send(null)}
        >
          Withdraw this counterbid
        </button>
        {dirty && (
          <button
            type="button"
            className="text-button"
            disabled={props.busy}
            onClick={() => {
              if (selectedBid === undefined) {
                setContestId(defaultContestId);
              }
              hydrateSelectedSlot();
              setSelectionFeedback("Unsaved edits reset.");
            }}
          >
            Reset unsaved edits
          </button>
        )}
      </div>
    </form>
  );
}

function TokenFields(props: {
  value: TokenDraft;
  maximums: TokenDraft;
  onChange(value: TokenDraft): void;
}) {
  return (
    <div className="token-fields">
      {OPERATION_IDS.map((operation) => (
        <CardCountSelect
          key={operation}
          label={operation}
          maximum={props.maximums[operation]}
          value={props.value[operation]}
          onChange={(value) => props.onChange({ ...props.value, [operation]: value })}
        />
      ))}
    </div>
  );
}

function CardCountSelect(props: {
  label: string;
  minimum?: number;
  maximum: number;
  value: number;
  onChange(value: number): void;
}) {
  const minimum = props.minimum ?? 0;
  const maximum = Math.max(minimum, props.maximum);
  return (
    <label>
      {props.label}
      <select
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      >
        {Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index)
          .map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
  );
}

function DecisionForm(props: {
  view: GameView;
  busy: boolean;
  onCommand(command: GameCommand): Promise<void>;
  decision: Record<string, unknown>;
}) {
  const decisionId = String(props.decision.id ?? "");
  const kind = String(props.decision.kind ?? "");
  if (kind === "pecking_swap") {
    const adjacent = Array.isArray(props.decision.adjacentIndexes)
      ? (props.decision.adjacentIndexes as number[])
      : [];
    return (
      <div className="phase-form">
        <h3>Move the Pecking Order</h3>
        <p>Choose the adjacent pair this operation card swaps.</p>
        <div className="swap-grid">
          {adjacent.map((index) => (
            <button
              className="ink-button"
              disabled={props.busy}
              key={index}
              onClick={() =>
                props.onCommand({
                  type: "game_action",
                  action: {
                    type: "resolve_pecking_swap",
                    decisionId,
                    adjacentIndex: index
                  }
                })
              }
            >
              {PARTIES_BY_ID[props.view.partyOrder[index]!]?.shortName} ↔{" "}
              {PARTIES_BY_ID[props.view.partyOrder[index + 1]!]?.shortName}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <OperationForm key={decisionId} {...props} decisionId={decisionId} />;
}

function OperationForm(props: {
  view: GameView;
  busy: boolean;
  onCommand(command: GameCommand): Promise<void>;
  decision: Record<string, unknown>;
  decisionId: string;
}) {
  const legal = Array.isArray(props.decision.legalOperations)
    ? (props.decision.legalOperations as OperationId[])
    : props.decision.operation
      ? [props.decision.operation as OperationId]
      : [];
  const partyId = String(
    props.decision.partyId ?? props.decision.contestId ?? ""
  ) as PartyId;
  const defaultOtherParty =
    PARTIES.find((party) => party.id !== partyId)?.id ?? "honeycomb";
  const [operation, setOperation] = useState<OperationId>(
    legal[0] ?? "organise"
  );
  const [districtId, setDistrictId] = useState<string>(DISTRICTS[0].id);
  const [sourceDistrictId, setSourceDistrictId] = useState("");
  const [rivalParty, setRivalParty] =
    useState<PartyId>(defaultOtherParty);
  const [targetParty, setTargetParty] =
    useState<PartyId>(defaultOtherParty);
  const [bonusDistrictId, setBonusDistrictId] = useState<string>(
    DISTRICTS[0].id
  );
  const [claimBonus, setClaimBonus] = useState(false);
  const [repeatSource, setRepeatSource] = useState("");
  const [repeatDestination, setRepeatDestination] = useState<string>(
    DISTRICTS[0].id
  );
  const party = PARTIES_BY_ID[partyId];
  const delayed = props.decision.kind === "night_delayed_operation";
  const matchingBonus = party?.bonuses.find(
    (bonus) => bonus.operation === operation
  );

  const choice: OperationChoice =
    operation === "organise"
      ? {
          operation,
          destinationDistrictId: districtId,
          ...(sourceDistrictId ? { sourceDistrictId } : {})
        }
      : operation === "rally"
        ? { operation, districtId, ...(claimBonus ? { bonusDistrictId } : {}) }
        : operation === "smear"
          ? {
              operation,
              districtId,
              rivalParty,
              ...(claimBonus ? { bonusDistrictId } : {})
            }
          : {
              operation,
              targetParty,
              ...(claimBonus ? { bonusDistrictId } : {})
            };
  const submittedChoice: OperationResolutionChoice =
    claimBonus && !delayed
      ? {
          choice,
          claimBonus: true,
          ...(partyId === "many-wings" && operation === "organise"
            ? {
                repeatChoice: {
                  operation: "organise",
                  destinationDistrictId: repeatDestination,
                  ...(repeatSource ? { sourceDistrictId: repeatSource } : {})
                }
              }
            : {})
        }
      : choice;

  return (
    <form
      className="phase-form"
      onSubmit={(event) => {
        event.preventDefault();
        void props.onCommand({
          type: "game_action",
          action: {
            type: "resolve_party_operation",
            decisionId: props.decisionId,
            operation,
            choice: submittedChoice
          }
        });
      }}
    >
      <h3>{delayed ? "Resolve delayed operation" : `Act for ${party?.shortName ?? partyId}`}</h3>
      <label>
        Operation card
        <select
          value={operation}
          disabled={legal.length === 1}
          onChange={(event) => setOperation(event.target.value as OperationId)}
        >
          {legal.map((candidate) => (
            <option key={candidate}>{candidate}</option>
          ))}
        </select>
      </label>
      {operation === "organise" && (
        <>
          <DistrictSelect
            label="Source district (leave blank when absent)"
            value={sourceDistrictId}
            allowBlank
            onChange={setSourceDistrictId}
          />
          <DistrictSelect label="Destination district" value={districtId} onChange={setDistrictId} />
        </>
      )}
      {(operation === "rally" || operation === "smear") && (
        <DistrictSelect label="District" value={districtId} onChange={setDistrictId} />
      )}
      {operation === "smear" && (
        <PartySelect label="Rival party" value={rivalParty} excludes={[partyId]} onChange={setRivalParty} />
      )}
      {operation === "court" && (
        <PartySelect
          label="Court space"
          value={targetParty}
          excludes={[partyId]}
          onChange={setTargetParty}
        />
      )}
      {!delayed && matchingBonus && (
        <label className="check-line bonus-check">
          <input
            type="checkbox"
            checked={claimBonus}
            onChange={(event) => setClaimBonus(event.target.checked)}
          />
          Claim {matchingBonus.name} · {matchingBonus.timing}
        </label>
      )}
      {claimBonus &&
        (partyId === "riverworks" ||
          (partyId === "many-wings" && operation === "court")) && (
          <DistrictSelect
            label="Bonus district"
            value={bonusDistrictId}
            onChange={setBonusDistrictId}
          />
        )}
      {claimBonus && partyId === "many-wings" && operation === "organise" && (
        <fieldset>
          <legend>Murmuration’s second Organise</legend>
          <DistrictSelect
            label="Second source (leave blank when absent)"
            value={repeatSource}
            allowBlank
            onChange={setRepeatSource}
          />
          <DistrictSelect
            label="Second destination"
            value={repeatDestination}
            onChange={setRepeatDestination}
          />
        </fieldset>
      )}
      <button className="ink-button" disabled={props.busy}>
        Resolve operation
      </button>
    </form>
  );
}

function DistrictSelect(props: {
  label: string;
  value: string;
  allowBlank?: boolean;
  onChange(value: string): void;
}) {
  return (
    <label>
      {props.label}
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.allowBlank && <option value="">No source</option>}
        {DISTRICTS.map((district) => (
          <option key={district.id} value={district.id}>
            {district.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PartySelect(props: {
  label: string;
  value: PartyId;
  excludes?: PartyId[];
  onChange(value: PartyId): void;
}) {
  return (
    <label>
      {props.label}
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as PartyId)}
      >
        {PARTIES.filter(
          (party) => !(props.excludes ?? []).includes(party.id)
        ).map((party) => (
          <option key={party.id} value={party.id}>{party.name}</option>
        ))}
      </select>
    </label>
  );
}

function ElectionDesk(props: {
  election: Record<string, unknown>;
  seats: ViewSeat[];
}) {
  const scores = Array.isArray(props.election.scores)
    ? (props.election.scores as Array<Record<string, unknown>>)
    : [];
  return (
    <section className="election-desk paper-panel">
      <p className="section-label">Election Day bulletin</p>
      <h2>Returns after round {String(props.election.afterRound ?? "")}</h2>
      <div className="election-scores">
        {scores.map((score) => (
          <article key={String(score.playerId)}>
            <strong>
              {props.seats.find((seat) => seat.id === score.playerId)?.displayName ??
                "Player"}
            </strong>
            <span>{Number(score.pointsChange) >= 0 ? "+" : ""}{String(score.pointsChange)} this election</span>
            <b>{String(score.resultingPoints)} points</b>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReplayArchiveView({ replay }: { replay: ReplayResponse }) {
  const [index, setIndex] = useState(replay.events.length - 1);
  const state = useMemo(() => {
    const engineEvents = replay.events
      .slice(0, index + 1)
      .flatMap((event) => {
        if (event.scope !== "completed_replay") {
          return [];
        }
        const canonical = objectValue(event.fullData["event"]);
        const payload = objectValue(canonical["payload"]);
        return Array.isArray(payload["engineEvents"])
          ? (payload["engineEvents"] as unknown as GameEvent[])
          : [];
      });
    if (engineEvents.length === 0) {
      return null;
    }
    try {
      return replayGame(engineEvents);
    } catch {
      return null;
    }
  }, [index, replay.events]);
  const selected = replay.events[index];

  return (
    <section className="replay-archive paper-panel">
      <div className="section-heading">
        <div>
          <p className="section-label">Unsealed archive</p>
          <h2>Deterministic replay desk</h2>
        </div>
        <b>{index + 1} / {replay.events.length}</b>
      </div>
      <label>
        Seek event
        <input
          type="range"
          min="0"
          max={Math.max(0, replay.events.length - 1)}
          value={index}
          onChange={(event) => setIndex(Number(event.target.value))}
        />
      </label>
      <div className="replay-controls">
        <button
          className="ink-button"
          disabled={index === 0}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
        >
          Previous
        </button>
        <button
          className="ink-button"
          disabled={index >= replay.events.length - 1}
          onClick={() =>
            setIndex((current) =>
              Math.min(replay.events.length - 1, current + 1)
            )
          }
        >
          Next
        </button>
        <span>{selected?.eventType ?? "Event"} · sequence {selected?.sequence ?? 0}</span>
      </div>
      {state === null ? (
        <p className="empty-copy">This lobby event predates the canonical game state.</p>
      ) : (
        <ReplayState state={state} />
      )}
      {selected?.scope === "completed_replay" && (
        <details className="event-payload">
          <summary>Inspect selected canonical event</summary>
          <pre>{JSON.stringify(selected.fullData, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function ReplayState({ state }: { state: GameState }) {
  const replaySeats: ViewSeat[] = state.seats.map((seat) => ({
    id: seat.id,
    displayName: seat.displayName,
    controller: seat.controller,
    position: seat.position,
    firmIds: [...seat.firmIds],
    points: seat.reserve.points,
    reserve: {
      leverage: seat.reserve.leverage,
      bluff: seat.reserve.bluff,
      operations: { ...seat.reserve.operations }
    },
    scoringCardId: seat.scoringCardId
  }));
  return (
    <div className="replay-state">
      <div className="replay-headline">
        <strong>Round {state.round} / 12</strong>
        <span>{state.phase.type}</span>
        <span>{state.electionNumber} Elections recorded</span>
      </div>
      <div className="replay-seats">
        {state.seats.map((seat) => (
          <article key={seat.id}>
            <strong>{seat.displayName}</strong>
            <b>{seat.reserve.points} points</b>
            <span>{seat.reserve.leverage} Leverage · {seat.reserve.bluff} Bluff · {OPERATION_IDS.map(
              (operation) => `${seat.reserve.operations[operation]} ${operation}`
            ).join(" · ")}</span>
            <small>Agenda {seat.scoringCardId}</small>
          </article>
        ))}
      </div>
      <DistrictMap support={state.support} />
      <div className="replay-columns">
        <section>
          <h3>Pecking Order & Coalition targets</h3>
          <ol className="replay-order">
            {state.partyOrder.map((partyId) => (
              <li key={partyId}>
                <strong>{PARTIES_BY_ID[partyId].name}</strong>
                <span>
                  Targets{" "}
                  {state.coalitionTargets[partyId]
                    ? PARTIES_BY_ID[state.coalitionTargets[partyId]!].shortName
                    : "no party"}
                </span>
                <small>{courtSupportSummary(state.courtSupport[partyId])}</small>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3>Table chat</h3>
          <div className="replay-chat">
            {state.chat.map((message) => (
              <p key={message.id}>
                <b>
                  {state.seats.find((seat) => seat.id === message.seatId)
                    ?.displayName ?? "Player"}:
                </b>{" "}
                {message.text}
              </p>
            ))}
            {state.chat.length === 0 && <p>No statements yet.</p>}
          </div>
        </section>
      </div>
      <section>
        <h3>Contests & complete bid contents</h3>
        <div className="contest-list">
          {orderedContestIds(state.contests, state.partyOrder).map((contestId) => (
            <ContestCard
              key={contestId}
              contestId={contestId}
              seats={replaySeats}
              bids={Object.values(state.bids).filter(
                (bid) => bid.contestId === contestId
              ) as unknown as Array<Record<string, unknown>>}
            />
          ))}
        </div>
      </section>
      <div className="replay-columns">
        <section>
          <h3>Resolved operations</h3>
          <ol className="operation-history">
            {state.resolvedOperations.map((operation, index) => (
              <li key={`${operation.bidId}-${index}`}>
                Round {operation.round} · {partyName(operation.contestId)} ·{" "}
                {operation.operation} · {operation.failure ?? "resolved"}
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3>Election bulletins</h3>
          {state.electionHistory.map((election) => (
            <article key={election.electionNumber}>
              <strong>
                Election {election.electionNumber} · round {election.afterRound}
              </strong>
              <p>
                {election.scores
                  .map((score) => {
                    const player = state.seats.find(
                      (seat) => seat.id === score.playerId
                    );
                    return `${player?.displayName ?? "Player"} ${score.resultingPoints}`;
                  })
                  .join(" · ")}
              </p>
            </article>
          ))}
        </section>
      </div>
      {state.phase.type === "complete" && (
        <p className="winner-banner">
          Winner{state.phase.winnerSeatIds.length === 1 ? "" : "s"}:{" "}
          {state.phase.winnerSeatIds
            .map(
              (seatId) =>
                state.seats.find((seat) => seat.id === seatId)?.displayName ??
                seatId
            )
            .join(", ")}
        </p>
      )}
    </div>
  );
}

export function DistrictMap({
  support,
  scoringObjectives = [],
  scoringLabel = "Private agenda"
}: {
  support: GameView["support"];
  scoringObjectives?: readonly ScoringObjective[] | undefined;
  scoringLabel?: "Private agenda" | "Election agenda";
}) {
  return <div className="district-map" aria-label="Bellweather district map">{DISTRICTS.map((district) => {
    const districtSupport = support[district.id] ?? {};
    const districtObjectives = scoringObjectives.filter(
      (objective) => objective.districtId === district.id
    );
    const scoringParties = districtObjectives.map(
      (objective) => PARTIES_BY_ID[objective.partyId]
    );
    const summary = Object.entries(districtSupport)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([party, count]) => `${PARTIES_BY_ID[party as PartyId].shortName} ${count}`)
      .join(", ");
    const pieces = Object.entries(districtSupport).flatMap(([party, count]) =>
      Array.from({ length: count ?? 0 }, (_, index) => (
        <i
          aria-hidden="true"
          key={`${party}-${index}`}
          style={{ "--party": PARTIES_BY_ID[party as PartyId].color } as React.CSSProperties}
          title={PARTIES_BY_ID[party as PartyId].name}
        />
      ))
    );
    const free = Math.max(0, district.capacity - pieces.length);
    return (
      <article
        key={district.id}
        className={`district district-${district.id}${scoringParties.length > 0 ? " district-scoring" : ""}`}
        style={scoringParties.length > 0 ? {
          "--scoring-accent": scoringParties.length === 1
            ? scoringParties[0]!.color
            : "var(--red)"
        } as React.CSSProperties : undefined}
        aria-label={`${district.name}: ${summary || "no Support"}; ${free} free spots${scoringParties.length > 0 ? `; ${scoringLabel.toLowerCase()} scores ${scoringParties.map((party) => party.name).join(", ")}` : ""}`}
      >
        <strong>{district.name}</strong>
        <small>{district.capacity} seats</small>
        {districtObjectives.length > 0 && (
          <span className="agenda-markers" aria-hidden="true">
            {districtObjectives.map((objective) => {
              const party = PARTIES_BY_ID[objective.partyId];
              return (
                <span
                  className="agenda-marker"
                  key={objective.partyId}
                  style={{ "--scoring-party": party.color } as React.CSSProperties}
                >
                  <b><PartyEmblem partyId={objective.partyId} /></b>
                  <span><em>{scoringLabel}</em>{party.shortName}</span>
                </span>
              );
            })}
          </span>
        )}
        <span className="sr-only">{summary || "No party Support"}. {free} free spots.</span>
        <div className="support-dots" aria-hidden="true">
          {pieces}
          {Array.from({ length: free }, (_, index) => (
            <i className="empty" key={`empty-${index}`} />
          ))}
        </div>
      </article>
    );
  })}</div>;
}

function revealedElectionObjectives(
  phase: string,
  election: Record<string, unknown> | undefined
): ScoringObjective[] {
  if (phase !== "election" || !Array.isArray(election?.scoringCards)) {
    return [];
  }
  const objectives = new Map<string, ScoringObjective>();
  for (const entry of election.scoringCards) {
    if (!isObject(entry) || typeof entry.scoringCardId !== "string") {
      continue;
    }
    if (!(entry.scoringCardId in SCORING_CARDS_BY_ID)) {
      continue;
    }
    const card = SCORING_CARDS_BY_ID[entry.scoringCardId as ScoringCardId];
    for (const objective of card.objectives) {
      objectives.set(
        `${objective.districtId}:${objective.partyId}`,
        objective
      );
    }
  }
  return [...objectives.values()];
}

export function PartyRail({
  view,
  interaction
}: {
  view: GameView;
  interaction?: {
    activePartyId: PartyId | null;
    assignedPartyIds: PartyId[];
    onSelect(partyId: PartyId): void;
  };
}) {
  return (
    <div className="party-rail">
      {(view.partyOrder.length ? view.partyOrder : PARTIES.map((party) => party.id)).map((id, index) => {
        const party = PARTIES_BY_ID[id];
        const selected = interaction?.activePartyId === id;
        const assignedElsewhere =
          interaction !== undefined &&
          interaction.assignedPartyIds.includes(id) &&
          !selected;
        const content = (
          <>
            <b>{index + 1}</b>
            <PartyEmblem partyId={id} className="party-glyph" />
            <span>
              <strong>{party.shortName}</strong>
              <small>Targets {view.coalitionTargets[id] ? PARTIES_BY_ID[view.coalitionTargets[id]!].shortName : "no party"} · {courtSupportSummary(view.courtSupport[id])}</small>
            </span>
          </>
        );
        const style = { "--party": party.color } as React.CSSProperties;
        return interaction ? (
          <button
            type="button"
            className={`party-summary party-summary-action ${selected ? "party-summary-selected" : ""} ${assignedElsewhere ? "party-summary-unavailable" : ""}`}
            aria-disabled={assignedElsewhere}
            aria-pressed={selected}
            key={id}
            style={style}
            onClick={() => {
              if (!assignedElsewhere) {
                interaction.onSelect(id);
              }
            }}
          >
            {content}
            {assignedElsewhere && (
              <span className="sr-only">Assigned to another opening bid</span>
            )}
          </button>
        ) : (
          <article className="party-summary" key={id} style={style}>{content}</article>
        );
      })}
    </div>
  );
}

function courtSupportSummary(
  support: Partial<Record<PartyId, number>> | undefined
): string {
  const placements = PARTIES.flatMap((party) => {
    const count = support?.[party.id] ?? 0;
    return count > 0 ? [`${party.shortName} ${count}`] : [];
  });
  return placements.length > 0 ? `Court ${placements.join(", ")}` : "Court empty";
}

export function PlayerLedger({
  seats,
  readySeatIds,
  showReadiness
}: {
  seats: ViewSeat[];
  readySeatIds: string[];
  showReadiness: boolean;
}) {
  return (
    <div className="player-ledger" aria-label="Player identities, points, and readiness">
      {seats.map((seat) => {
        const firmId = seat.firmIds[0];
        const ready = readySeatIds.includes(seat.id);
        return (
          <article
            className={showReadiness ? (ready ? "player-ready" : "player-waiting") : ""}
            key={seat.id}
            style={firmId ? {
              "--firm-accent": FIRM_ACCENTS[firmId]
            } as React.CSSProperties : undefined}
          >
            {firmId && <FirmEmblem firmId={firmId} className="player-ledger-emblem" />}
            <div className="player-ledger-identity">
              <span>{seat.displayName}</span>
              {firmId && <small>{FIRMS_BY_ID[firmId].name}</small>}
            </div>
            <div className="player-ledger-points">
              <strong>{seat.points}</strong>
              <small>points</small>
            </div>
            {showReadiness && (
              <b className="player-ledger-status">
                {ready ? "Ready" : "Waiting"}
              </b>
            )}
          </article>
        );
      })}
    </div>
  );
}

function LoadingDesk({ error, onLeave }: { error: string | null; onLeave(): void }) {
  return <main className="loading-page"><p className="kicker">The Bellweather Register</p><h1>Waiting on the wire…</h1>{error && <p role="alert">{error}</p>}<button className="text-button" onClick={onLeave}>Clear saved session</button></main>;
}

function extractView(state: ViewerStateEnvelope): GameView | null {
  const publicGame = state.publicState.publicGame;
  const privateGame = state.scope === "seat" ? state.seatState.privateGame : null;
  if (!isObject(publicGame) || !Array.isArray(publicGame.seats)) {
    return null;
  }
  const phase = isObject(publicGame.phase) ? publicGame.phase : {};
  const privateState = isObject(privateGame) ? privateGame : {};
  const viewerSeatId = state.scope === "seat" ? state.viewerSeatId : null;
  const seats = (publicGame.seats as Array<Record<string, unknown>>).map(
    (seat) => ({
      ...seat,
      reserve: seat.id === viewerSeatId ? privateState.reserve ?? null : null,
      scoringCardId:
        seat.id === viewerSeatId ? privateState.scoringCardId ?? null : null
    })
  );
  const contests = isObject(publicGame.contests) ? publicGame.contests : {};
  const publicBids = Object.values(contests).flatMap((contest) =>
    isObject(contest) && Array.isArray(contest.bids) ? contest.bids : []
  );
  const ownBids = Array.isArray(privateState.ownBids)
    ? privateState.ownBids
    : [];
  const bidsById = new Map<string, Record<string, unknown>>();
  for (const bid of [...publicBids, ...ownBids]) {
    if (isObject(bid) && typeof bid.id === "string") {
      bidsById.set(bid.id, { ...(bidsById.get(bid.id) ?? {}), ...bid });
    }
  }
  return {
    playerCount: state.publicState.configuration.playerCount,
    round: numberOr(publicGame.round, 1),
    electionNumber: numberOr(publicGame.electionNumber, 0),
    phase: typeof phase.type === "string" ? phase.type : String(publicGame.phase),
    phaseData: phase,
    deadlineAt: typeof phase.deadlineAt === "number" ? phase.deadlineAt : null,
    nextFirstOpenerSeatId:
      typeof publicGame.nextFirstOpenerSeatId === "string"
        ? publicGame.nextFirstOpenerSeatId
        : "",
    seats: seats as unknown as ViewSeat[],
    partyOrder: Array.isArray(publicGame.partyOrder)
      ? (publicGame.partyOrder as PartyId[])
      : [],
    support: isObject(publicGame.support)
      ? (publicGame.support as GameView["support"])
      : {},
    courtSupport: isObject(publicGame.courtSupport)
      ? (publicGame.courtSupport as GameView["courtSupport"])
      : Object.fromEntries(PARTIES.map((party) => [party.id, {}])) as GameView["courtSupport"],
    coalitionTargets: isObject(publicGame.coalitionTargets)
      ? (publicGame.coalitionTargets as GameView["coalitionTargets"])
      : {},
    contests,
    bids: [...bidsById.values()],
    readySeatIds: Array.isArray(phase.readySeatIds)
      ? (phase.readySeatIds as string[])
      : [],
    pendingDecision: isObject(privateState.pendingDecision)
      ? privateState.pendingDecision
      : isObject(phase.pendingDecision) &&
          phase.pendingDecision.seatId === viewerSeatId
        ? phase.pendingDecision
        : null,
    counterbidSlots: Array.isArray(privateState.counterbidSlots)
      ? (privateState.counterbidSlots as Array<string | null>)
      : [],
    electionHistory: Array.isArray(publicGame.electionHistory)
      ? (publicGame.electionHistory as Array<Record<string, unknown>>)
      : [],
    chat: Array.isArray(publicGame.chat)
      ? (publicGame.chat as GameView["chat"])
      : []
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function loadSession(): ParticipantSession | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value === null ? null : JSON.parse(value) as ParticipantSession;
  } catch {
    return null;
  }
}

function leave(setSession: (session: ParticipantSession | null) => void) {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(INVITE_KEY);
  setSession(null);
}

function timerCopy(deadline: number | null): string {
  if (deadline === null) return "No active deadline";
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
  return `${remaining}s on counterbids`;
}

function partyName(id: string): string {
  return id in PARTIES_BY_ID ? PARTIES_BY_ID[id as PartyId].name : id === "pecking-order" ? "Pecking Order" : id;
}

export function orderedContestIds(
  contests: Record<string, unknown>,
  partyOrder: readonly PartyId[] | undefined
): string[] {
  const currentPartyOrder = partyOrder ?? [];
  const partyRanks = new Map<string, number>(
    currentPartyOrder.map((partyId, index) => [partyId, index])
  );
  return Object.keys(contests)
    .map((id, insertionIndex) => ({ id, insertionIndex }))
    .sort((left, right) => {
      const leftRank = left.id === "pecking-order"
        ? -1
        : (partyRanks.get(left.id) ?? currentPartyOrder.length);
      const rightRank = right.id === "pecking-order"
        ? -1
        : (partyRanks.get(right.id) ?? currentPartyOrder.length);
      return leftRank - rightRank || left.insertionIndex - right.insertionIndex;
    })
    .map(({ id }) => id);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function messageOf(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : "The wire service failed";
}
