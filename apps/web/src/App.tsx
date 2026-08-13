import {
  DISTRICTS,
  FIRMS_BY_ID,
  OPERATION_IDS,
  PARTIES,
  PARTIES_BY_ID,
  RULESET_VERSION,
  SCORING_CARDS_BY_ID,
  type FirmId,
  type OperationId,
  type PartyId,
  type ScoringCardId
} from "@bellweather/content";
import {
  MAX_PLAYER_COUNT,
  MIN_PLAYER_COUNT,
  type GameCommand,
  type ParticipantSession,
  type ReplayResponse,
  type ViewerStateEnvelope
} from "@bellweather/protocol";
import {
  resolveOperation,
  type GameView as EngineGameView,
  type OperationChoice,
  type OperationState,
  type ProjectedSeat
} from "@bellweather/game";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  createLobby,
  getReplay,
  getState,
  joinLobby,
  sendCommand
} from "./api.js";
import { FIRM_ACCENTS, FirmEmblem } from "./FirmEmblem.js";
import { PartyEmblem } from "./PartyEmblem.js";

const SESSION_KEY = "bellweather-register-session";

export type GameView = EngineGameView;
export type ViewSeat = ProjectedSeat;

interface OperationDraft {
  id: number;
  operation: OperationId;
  sourceDistrictId: string;
  destinationDistrictId: string;
  districtId: string;
  rivalParty: PartyId;
  targetParty: PartyId;
  bonusDistrictId: string;
  bonusDistrictIds: string[];
  bonusSourceDistrictId: string;
  bonusCourtSourceParty: PartyId | "";
  bonusCourtParty: PartyId | "";
  claimBonus: boolean;
}

export function App() {
  const [session, setSession] = useState<ParticipantSession | null>(loadSession);
  const [state, setState] = useState<ViewerStateEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replayArchive, setReplayArchive] = useState<ReplayResponse | null>(null);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (session === null) return;
    const sequence = ++refreshSequence.current;
    try {
      const next = await getState(session);
      if (sequence === refreshSequence.current) {
        setState(next);
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
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1_500);
    };
    void poll();
    return () => {
      cancelled = true;
      refreshSequence.current += 1;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refresh, session]);

  useEffect(() => setReplayArchive(null), [session?.gameId]);

  const adoptSession = (
    nextSession: ParticipantSession,
    nextState: ViewerStateEnvelope
  ) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setState(nextState);
  };

  const command = async (gameCommand: GameCommand): Promise<boolean> => {
    if (session === null || state === null) return false;
    setBusy(true);
    setError(null);
    try {
      await sendCommand(session, gameCommand, state.publicState.version);
      await refresh();
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
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
        onCreate={(response) => adoptSession(response.session, response.state)}
        onJoin={(response) => adoptSession(response.session, response.state)}
      />
    );
  }
  if (state === null) {
    return <LoadingDesk error={error} onLeave={() => leave(setSession)} />;
  }

  let view: GameView | null = null;
  let viewError: string | null = null;
  try {
    view = extractView(state);
  } catch (caught) {
    viewError = messageOf(caught);
  }
  const ownSeatId = session.participantType === "seat" ? session.seatId : undefined;
  const ownSeat = view?.seats.find((seat) => seat.id === ownSeatId);
  const host = state.publicState.seats.find((seat) => seat.role === "host");

  return (
    <div className="app-shell">
      <header className="masthead">
        <div>
          <p className="kicker">The Bellweather Register · Influence Desk</p>
          <h1>Access opens.<br />Influence follows.</h1>
        </div>
        <div className="edition-stamp">
          <span>{state.publicState.lifecycle}</span>
          <strong>{view === null ? "Lobby edition" : `Year ${view.year} / 12`}</strong>
          <small>Invite {state.publicState.inviteCode}</small>
        </div>
      </header>

      <nav className="ticker" aria-label="Game status">
        <span>Players {state.publicState.configuration.playerCount}</span>
        <span>Election {view?.electionNumber ?? 0} / 3</span>
        <span>{view === null ? "Assembling table" : phaseName(view.phase)}</span>
        <span>Election years 4 · 8 · 12</span>
      </nav>

      {(error ?? viewError) !== null && (
        <div className="error-banner" role="alert">{error ?? viewError}</div>
      )}

      {state.publicState.lifecycle === "lobby" ? (
        <LobbyDesk
          state={state}
          session={session}
          hostSeatId={host?.seatId}
          busy={busy}
          onCommand={async (gameCommand) => { await command(gameCommand); }}
        />
      ) : view !== null ? (
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
          <h2>The game record could not be opened.</h2>
        </section>
      )}

      {state.publicState.lifecycle === "completed" && (
        <section className="replay-strip">
          <div>
            <p className="section-label">Late edition</p>
            <h2>The complete record is unsealed.</h2>
          </div>
          <button
            className="ink-button"
            onClick={() => void getReplay(session).then(setReplayArchive).catch(
              (caught) => setError(messageOf(caught))
            )}
          >
            Open archive
          </button>
          {replayArchive !== null && <strong>{replayArchive.events.length} events</strong>}
        </section>
      )}
      {replayArchive !== null && <ReplayArchiveView replay={replayArchive} />}

      <footer>
        <span>Ruleset {RULESET_VERSION}</span>
        <button className="text-button" onClick={() => leave(setSession)}>
          Leave this desk
        </button>
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
  const [spectators, setSpectators] = useState(true);
  const [role, setRole] = useState<"player" | "spectator">("player");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    props.onBusy(true);
    props.onError(null);
    try {
      if (mode === "create") {
        props.onCreate(await createLobby({
          displayName: name,
          controller: "human",
          configuration: { allowSpectators: spectators }
        }));
      } else {
        props.onJoin(await joinLobby({
          inviteCode: code.toUpperCase() as never,
          displayName: name,
          controller: "human",
          role
        }));
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
        <p className="standfirst">
          Twelve years of access, operations, and political capital—filed one
          party at a time.
        </p>
        <div className="front-page-rule">
          <span>12 years</span><span>3 elections</span><span>6 parties</span>
        </div>
      </section>
      <section className="entry-form paper-panel">
        <div className="tab-row" role="tablist">
          <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Open a table</button>
          <button type="button" className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>Join by code</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>Byline<input required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your display name" /></label>
          {mode === "create" ? (
            <label className="check-line"><input type="checkbox" checked={spectators} onChange={(event) => setSpectators(event.target.checked)} /> Admit observers</label>
          ) : (
            <>
              <label>Invitation code<input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="REGISTER8" autoCapitalize="characters" /></label>
              <label>Desk<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="player">Player</option><option value="spectator">Observer</option></select></label>
            </>
          )}
          {props.error !== null && <p className="form-error" role="alert">{props.error}</p>}
          <button className="red-button" disabled={props.busy}>
            {props.busy ? "Sending…" : mode === "create" ? "Print first edition" : "Enter the newsroom"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function LobbyDesk(props: {
  state: ViewerStateEnvelope;
  session: ParticipantSession;
  hostSeatId: string | undefined;
  busy: boolean;
  onCommand(command: GameCommand): Promise<void>;
}) {
  const seatId = props.session.participantType === "seat" ? props.session.seatId : undefined;
  const self = props.state.publicState.seats.find((seat) => seat.seatId === seatId);
  const playerCount = props.state.publicState.configuration.playerCount;
  const remainingSeats = MAX_PLAYER_COUNT - playerCount;
  return (
    <main className="lobby-layout">
      <section className="paper-panel lobby-call">
        <p className="section-label">Invitation wire</p>
        <h2>{props.state.publicState.inviteCode}</h2>
        <p>Share the code. Player seats close when the first year begins.</p>
        <div className="seat-list">
          {props.state.publicState.seats.map((seat) => (
            <article key={seat.seatId}>
              <span className={`status-dot ${seat.ready ? "ready" : ""}`} />
              <div><strong>{seat.displayName}</strong><small>{seat.role} · {seat.controller}</small></div>
              <b>{seat.ready ? "Filed" : "At desk"}</b>
            </article>
          ))}
        </div>
        {remainingSeats > 0 && <p>{remainingSeats} open {remainingSeats === 1 ? "desk" : "desks"}.</p>}
        <div className="button-row">
          {seatId !== undefined && (
            <button className="ink-button" disabled={props.busy} onClick={() => void props.onCommand({ type: "set_lobby_ready", ready: !self?.ready })}>
              {self?.ready ? "Withdraw filing" : "Mark ready"}
            </button>
          )}
          {seatId === props.hostSeatId && (
            <button className="red-button" disabled={props.busy || playerCount < MIN_PLAYER_COUNT} onClick={() => void props.onCommand({ type: "start_game" })}>
              {playerCount < MIN_PLAYER_COUNT ? "Waiting for one more player" : "Start Year 1"}
            </button>
          )}
        </div>
      </section>
      <aside className="briefing paper-panel">
        <p className="section-label">Editor’s briefing</p>
        <h3>The yearly cycle</h3>
        <ol className="cycle-list">
          <li><b>Openings</b><span>Place Firms in Early Bird order.</span></li>
          <li><b>Lobby</b><span>Operate, Collect, Close, or Pass.</span></li>
          <li><b>Cleanup</b><span>Release the New Year cards and reset.</span></li>
          <li><b>Election</b><span>After Years 4, 8, and 12.</span></li>
        </ol>
        <dl>
          <div><dt>Players</dt><dd>{playerCount} / {MAX_PLAYER_COUNT}</dd></div>
          <div><dt>Observers</dt><dd>{props.state.publicState.configuration.allowSpectators ? "Admitted" : "Closed"}</dd></div>
        </dl>
      </aside>
    </main>
  );
}

export function GameDesk(props: {
  view: GameView;
  ownSeat: ViewSeat | undefined;
  ownSeatId: string | undefined;
  spectator: boolean;
  busy: boolean;
  onCommand(command: GameCommand): Promise<boolean | void>;
}) {
  const latestElection = props.view.electionHistory.at(-1);
  return (
    <main className="game-grid">
      <PrivateFolio view={props.view} seat={props.ownSeat} spectator={props.spectator} />
      <section className="map-desk paper-panel">
        <SectionHeading label="Constituency wire" title="Bellweather map" slug={`Year ${props.view.year}`} />
        <PartyBoard view={props.view} />
        <DistrictMap view={props.view} />
      </section>
      <aside className="action-desk paper-panel">
        <SectionHeading label="Active desk" title={phaseName(props.view.phase)} slug={turnSlug(props.view)} />
        {props.spectator || props.ownSeat === undefined || props.ownSeatId === undefined ? (
          <WaitingCopy view={props.view} observer />
        ) : (
          <ActionDesk
            view={props.view}
            seat={props.ownSeat}
            seatId={props.ownSeatId}
            busy={props.busy}
            onCommand={props.onCommand}
          />
        )}
      </aside>
      <PlayerLedger view={props.view} />
      {latestElection !== undefined && <ElectionBulletin view={props.view} />}
      <YearArchive view={props.view} />
      <ChatDesk view={props.view} busy={props.busy} spectator={props.spectator} onCommand={props.onCommand} />
    </main>
  );
}

function PrivateFolio(props: {
  view: GameView;
  seat: ViewSeat | undefined;
  spectator: boolean;
}) {
  const firmId = props.seat?.firmIds[0] as FirmId | undefined;
  const style = firmId === undefined ? undefined : {
    "--folio-firm": FIRM_ACCENTS[firmId]
  } as CSSProperties;
  return (
    <aside className={`private-folio paper-panel ${firmId === undefined ? "private-folio-neutral" : "private-folio-firm"}`} style={style}>
      {firmId !== undefined && <FirmEmblem firmId={firmId} className="folio-watermark" />}
      <div className="folio-heading">
        <p className="section-label">{props.spectator ? "Observer’s copy" : "Private folio"}</p>
        <h2>{props.seat?.displayName ?? "Press gallery"}</h2>
        <p>{firmId === undefined ? "Public information only" : FIRMS_BY_ID[firmId].name}</p>
      </div>
      {props.seat !== undefined && props.seat.operations !== null ? (
        <>
          <div className="folio-inventory" aria-label="Operation hand">
            {OPERATION_IDS.map((operation) => (
              <Metric key={operation} label={operation} value={props.seat!.operations![operation]} />
            ))}
            <Metric label="Collect" value={props.seat.collectionCounters} />
            <Metric label="New Year" value={props.seat.newYearCardCount} accent />
            <Metric label="Points" value={props.seat.points} dark />
          </div>
          <div className="new-year-area">
            <span>New Year area · unavailable this year</span>
            {OPERATION_IDS.map((operation) => (
              <b key={operation}>{operation.slice(0, 3).toUpperCase()} {props.seat!.newYearOperations?.[operation] ?? 0}</b>
            ))}
          </div>
          <div className="agenda-stack">
            {(props.seat.scoringCardIds ?? []).flatMap((slot, slotIndex) =>
              slot.map((cardId, index) => (
                <ScoringCard
                  key={cardId}
                  cardId={cardId as ScoringCardId}
                  capital={index === 0}
                  electionNumber={slotIndex + 1}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <p className="folio-public-copy">Hands, New Year cards, and future scoring cards remain private.</p>
      )}
    </aside>
  );
}

function Metric(props: { label: string; value: number; accent?: boolean; dark?: boolean }) {
  return <div className={`folio-metric ${props.accent ? "folio-accent" : ""} ${props.dark ? "folio-dark" : ""}`}><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function ScoringCard(props: {
  cardId: ScoringCardId;
  capital: boolean;
  electionNumber: number;
}) {
  const card = SCORING_CARDS_BY_ID[props.cardId];
  return (
    <article className="agenda-card">
      <span>Election {props.electionNumber} · {props.capital ? "Capital card" : "District card"} · {card.id}</span>
      <strong>{card.objectives.map((objective) => PARTIES_BY_ID[objective.partyId].shortName).join(" · ")}</strong>
      <small>{card.objectives.map((objective) => DISTRICTS.find((district) => district.id === objective.districtId)?.name).join(" / ")}</small>
    </article>
  );
}

export function PartyBoard({ view }: { view: GameView }) {
  return (
    <div className="party-board" aria-label="Party access and Operation piles">
      {PARTIES.map((party) => {
        const state = view.parties[party.id];
        const owner = view.seats.find((seat) => seat.id === state?.ownerSeatId);
        const pile = state === undefined ? 0 : operationCount(state.operations);
        return (
          <article
            key={party.id}
            className={`party-file ${state?.status === "closed" ? "party-file-closed" : ""}`}
            style={{ "--party": party.color } as CSSProperties}
          >
            <PartyEmblem partyId={party.id} className="party-file-emblem" />
            <div className="party-file-title"><strong>{party.shortName}</strong><small>{state === undefined ? "Not opened" : `${state.status} · ${owner?.displayName ?? "Unknown"}`}</small></div>
            <div className="pile-count"><b>{pile}</b><span>pile</span></div>
            <div className="pile-cards" aria-label={`${pile} Operation cards`}>
              {state !== undefined && OPERATION_IDS.map((operation) => state.operations[operation] > 0 && <span key={operation}>{operation.slice(0, 3)} {state.operations[operation]}</span>)}
            </div>
            <div className="bonus-flags">
              {party.bonuses.map((bonus) => <span key={bonus.operation} className={state?.claimedBonuses.includes(bonus.operation) ? "bonus-used" : ""}>{bonus.name}</span>)}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function DistrictMap({ view }: { view: GameView }) {
  return (
    <div className="district-map" aria-label="Bellweather district map">
      {DISTRICTS.map((district) => {
        const support = view.support[district.id] ?? {};
        const occupied = PARTIES.reduce((total, party) => total + (support[party.id] ?? 0), 0);
        return (
          <article
            key={district.id}
            className={`district district-${district.id}`}
            aria-label={`${district.name}: ${occupied} of ${district.capacity} Support spaces occupied`}
          >
            <div><strong>{district.name}</strong><small>{occupied}/{district.capacity} support</small></div>
            <div className="support-groups">
              {PARTIES.map((party) => (support[party.id] ?? 0) > 0 && (
                <span key={party.id} style={{ "--party": party.color } as CSSProperties} title={`${party.shortName}: ${support[party.id]}`}>
                  <PartyEmblem partyId={party.id} />{support[party.id]}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function PlayerLedger({ view }: { view: GameView }) {
  const ordered = rotateSeats(view.seats, view.earlyBirdSeatId);
  const activeSeatId = activeSeat(view);
  return (
    <section className="player-ledger-block paper-panel">
      <SectionHeading label="Order of business" title="Firm ledger" slug="Early Bird first" />
      <div className="player-ledger">
        {ordered.map((seat, index) => {
          const firmId = seat.firmIds[0] as FirmId | undefined;
          return (
            <article key={seat.id} className={seat.id === activeSeatId ? "player-active" : ""} style={{ "--firm-accent": firmId === undefined ? "#ddd5c4" : FIRM_ACCENTS[firmId] } as CSSProperties}>
              {firmId !== undefined && <FirmEmblem firmId={firmId} className="player-ledger-emblem" />}
              <div><span>{index === 0 ? "Early Bird" : `Seat ${seat.position + 1}`}</span><strong>{seat.displayName}</strong></div>
              <div className="ledger-count"><b>{seat.points}</b><small>points</small></div>
              <div className="ledger-sub"><span>{seat.handCount} cards</span><span>{seat.collectionCounters} collects</span><span>{seat.newYearCardCount} New Year</span></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ActionDesk(props: {
  view: GameView;
  seat: ViewSeat;
  seatId: string;
  busy: boolean;
  onCommand(command: GameCommand): Promise<boolean | void>;
}) {
  if (props.view.phase === "opening") {
    return <OpeningDesk {...props} />;
  }
  if (props.view.phase === "lobby") {
    return <LobbyActionDesk {...props} />;
  }
  if (props.view.phase === "election") {
    const ready = props.view.phaseData.type === "election"
      ? props.view.phaseData.readySeatIds.includes(props.seatId)
      : false;
    const scored = props.view.phaseData.type === "election" && props.view.phaseData.resultsRecorded;
    return (
      <div className="action-copy">
        <p>Cleanup is complete. Election {props.view.phaseData.type === "election" ? props.view.phaseData.electionNumber : ""} has been scored.</p>
        <button className="red-button" disabled={props.busy || !scored} onClick={() => void props.onCommand({ type: "game_action", action: { type: "set_election_ready", ready: !ready } })}>
          {ready ? "Reviewing results" : "Ready for next year"}
        </button>
      </div>
    );
  }
  return <WaitingCopy view={props.view} />;
}

function OpeningDesk(props: {
  view: GameView;
  seat: ViewSeat;
  seatId: string;
  busy: boolean;
  onCommand(command: GameCommand): Promise<boolean | void>;
}) {
  const phase = props.view.phaseData;
  const active = phase.type === "opening"
    ? phase.turnSeatIds[phase.turnIndex]
    : undefined;
  const usedFirmIds = new Set(Object.values(props.view.parties).flatMap((party) => party === undefined ? [] : [party.firmId]));
  const availableFirms = props.seat.firmIds.filter((firmId) => !usedFirmIds.has(firmId as FirmId));
  const availableParties = PARTIES.filter((party) => props.view.parties[party.id] === undefined);
  const [firmId, setFirmId] = useState<string>(availableFirms[0] ?? "");
  const [partyId, setPartyId] = useState<string>(availableParties[0]?.id ?? "");
  useEffect(() => {
    if (!availableFirms.includes(firmId)) setFirmId(availableFirms[0] ?? "");
    if (!availableParties.some((party) => party.id === partyId)) setPartyId(availableParties[0]?.id ?? "");
  }, [availableFirms, availableParties, firmId, partyId]);

  if (active !== props.seatId) return <WaitingCopy view={props.view} />;
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (firmId === "" || partyId === "") return;
      void props.onCommand({ type: "game_action", action: { type: "open_party", firmId: firmId as FirmId, partyId: partyId as PartyId } });
    }}>
      <p className="action-lede">Place one uncommitted Firm at one unopened party. Low-player games use the full ABBA or ABCCBA opening order.</p>
      <label>Firm<select aria-label="Firm" value={firmId} onChange={(event) => setFirmId(event.target.value)}>{availableFirms.map((id) => <option key={id} value={id}>{FIRMS_BY_ID[id as FirmId].name}</option>)}</select></label>
      <label>Party<select aria-label="Party" value={partyId} onChange={(event) => setPartyId(event.target.value)}>{availableParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
      <button className="red-button" disabled={props.busy || firmId === "" || partyId === ""}>Open party access</button>
    </form>
  );
}

function LobbyActionDesk(props: {
  view: GameView;
  seat: ViewSeat;
  seatId: string;
  busy: boolean;
  onCommand(command: GameCommand): Promise<boolean | void>;
}) {
  const active = props.view.phaseData.type === "lobby" ? props.view.phaseData.activeSeatId : undefined;
  const [mode, setMode] = useState<"operate" | "collect" | "close" | "pass">("operate");
  const openPartyIds = PARTIES.map((party) => party.id).filter((partyId) => props.view.parties[partyId]?.status === "open");
  const [partyId, setPartyId] = useState<PartyId>(openPartyIds[0] ?? "honeycomb");
  useEffect(() => {
    if (!openPartyIds.includes(partyId)) setPartyId(openPartyIds[0] ?? "honeycomb");
  }, [openPartyIds, partyId]);
  if (active !== props.seatId) return <WaitingCopy view={props.view} />;

  const party = props.view.parties[partyId];
  const firstTurn = props.view.phaseData.type === "lobby" && (props.view.phaseData.turnsTaken[props.seatId] ?? 0) === 0;
  const collectLegal = party !== undefined && operationCount(party.operations) > 0 && props.seat.collectionCounters > 0;
  const closeLegal = party !== undefined && party.ownerSeatId === props.seatId && !firstTurn;
  return (
    <div className="lobby-action-desk">
      <div className="action-tabs" role="tablist" aria-label="Lobby actions">
        {(["operate", "collect", "close", "pass"] as const).map((action) => (
          <button key={action} type="button" className={mode === action ? "active" : ""} onClick={() => setMode(action)}>{action}</button>
        ))}
      </div>
      {mode === "operate" && (
        <OperationComposer view={props.view} seat={props.seat} partyId={partyId} onPartyId={setPartyId} busy={props.busy} onSubmit={(plays) => props.onCommand({ type: "game_action", action: { type: "operate", partyId, plays } })} />
      )}
      {mode === "collect" && (
        <SimplePartyAction title="Collect" copy="Spend one Collection counter and take the complete public pile into your New Year area. The party stays open." partyId={partyId} onPartyId={setPartyId} partyIds={openPartyIds} disabled={props.busy || !collectLegal} button={`Collect ${party === undefined ? 0 : operationCount(party.operations)} cards`} onSubmit={() => props.onCommand({ type: "game_action", action: { type: "collect", partyId } })} />
      )}
      {mode === "close" && (
        <SimplePartyAction title="Close" copy={firstTurn ? "You cannot Close on your first Lobby turn, even if you previously passed." : "Only the opening Firm may Close. Its owner takes the pile into their New Year area."} partyId={partyId} onPartyId={setPartyId} partyIds={openPartyIds} disabled={props.busy || !closeLegal} button="Close party" onSubmit={() => props.onCommand({ type: "game_action", action: { type: "close", partyId } })} />
      )}
      {mode === "pass" && (
        <div className="action-copy"><h3>Pass</h3><p>If every player passes consecutively, every party closes to its opening Firm and the year ends.</p><button className="red-button" disabled={props.busy} onClick={() => void props.onCommand({ type: "game_action", action: { type: "pass" } })}>Pass this turn</button></div>
      )}
    </div>
  );
}

function SimplePartyAction(props: {
  title: string;
  copy: string;
  partyId: PartyId;
  onPartyId(partyId: PartyId): void;
  partyIds: PartyId[];
  disabled: boolean;
  button: string;
  onSubmit(): Promise<boolean | void>;
}) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); void props.onSubmit(); }}>
      <div className="action-copy"><h3>{props.title}</h3><p>{props.copy}</p></div>
      <PartySelect partyId={props.partyId} partyIds={props.partyIds} onPartyId={props.onPartyId} />
      <button className="red-button" disabled={props.disabled}>{props.button}</button>
    </form>
  );
}

export function OperationComposer(props: {
  view: GameView;
  seat: ViewSeat;
  partyId: PartyId;
  onPartyId(partyId: PartyId): void;
  busy: boolean;
  onSubmit(plays: Array<{ operation: OperationId; choice: OperationChoice; claimBonus?: boolean }>): Promise<boolean | void>;
}) {
  const [drafts, setDrafts] = useState<OperationDraft[]>([]);
  const nextId = useRef(1);
  const lobbyTurn = props.view.phaseData.type === "lobby"
    ? props.view.phaseData.turn
    : 0;
  useEffect(() => setDrafts([]), [props.partyId, props.view.year, lobbyTurn]);
  const operationState = useMemo(() => toOperationState(props.view), [props.view]);
  const preview = useMemo(
    () => previewDrafts(operationState, props.partyId, drafts, props.seat.operations),
    [operationState, props.partyId, drafts, props.seat.operations]
  );
  const openPartyIds = PARTIES.map((party) => party.id).filter((partyId) => props.view.parties[partyId]?.status === "open");
  const claimedBonuses = props.view.parties[props.partyId]?.claimedBonuses ?? [];
  const used = operationUsage(drafts);
  const add = (operation: OperationId) => setDrafts((current) => [
    ...current,
    emptyOperationDraft(nextId.current++, operation, props.partyId)
  ]);
  const update = (id: number, patch: Partial<OperationDraft>) => setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (preview.plays !== null) void props.onSubmit(preview.plays);
    }}>
      <p className="action-lede">Play one to three Operation cards on one open party. Resolve them in this order; at most one may use a party bonus.</p>
      <PartySelect partyId={props.partyId} partyIds={openPartyIds} onPartyId={props.onPartyId} />
      <div className="operation-adders" aria-label="Add an Operation card">
        {OPERATION_IDS.map((operation) => (
          <button type="button" key={operation} disabled={drafts.length >= 3 || used[operation] >= (props.seat.operations?.[operation] ?? 0)} onClick={() => add(operation)}>
            + {operation} <b>{(props.seat.operations?.[operation] ?? 0) - used[operation]}</b>
          </button>
        ))}
      </div>
      <div className="operation-stack">
        {drafts.length === 0 && <p className="empty-copy">Choose 1–3 cards from your hand.</p>}
        {drafts.map((draft, index) => (
          <OperationDraftCard
            key={draft.id}
            index={index}
            draft={draft}
            partyId={props.partyId}
            claimedBonuses={claimedBonuses}
            anotherBonus={drafts.some((candidate) => candidate.id !== draft.id && candidate.claimBonus)}
            onUpdate={(patch) => update(draft.id, patch)}
            onRemove={() => setDrafts((current) => current.filter((candidate) => candidate.id !== draft.id))}
          />
        ))}
      </div>
      {preview.message !== null && <p className="validation-copy">{preview.message}</p>}
      <button className="red-button" disabled={props.busy || preview.plays === null}>Operate with {drafts.length} {drafts.length === 1 ? "card" : "cards"}</button>
    </form>
  );
}

function OperationDraftCard(props: {
  index: number;
  draft: OperationDraft;
  partyId: PartyId;
  claimedBonuses: OperationId[];
  anotherBonus: boolean;
  onUpdate(patch: Partial<OperationDraft>): void;
  onRemove(): void;
}) {
  const bonus = PARTIES_BY_ID[props.partyId].bonuses.find((candidate) => candidate.operation === props.draft.operation);
  const bonusAvailable = bonus !== undefined && !props.claimedBonuses.includes(props.draft.operation);
  return (
    <fieldset className="operation-card">
      <legend>{props.index + 1}. {props.draft.operation}</legend>
      <button type="button" className="remove-card" aria-label={`Remove ${props.draft.operation}`} onClick={props.onRemove}>×</button>
      {props.draft.operation === "organise" && (
        <div className="field-grid"><DistrictSelect label="Source" optional value={props.draft.sourceDistrictId} onChange={(sourceDistrictId) => props.onUpdate({ sourceDistrictId })} /><DistrictSelect label="Destination" value={props.draft.destinationDistrictId} onChange={(destinationDistrictId) => props.onUpdate({ destinationDistrictId })} /></div>
      )}
      {props.draft.operation === "rally" && <DistrictSelect label="Rally district" value={props.draft.districtId} onChange={(districtId) => props.onUpdate({ districtId })} />}
      {props.draft.operation === "smear" && <div className="field-grid"><DistrictSelect label="District" value={props.draft.districtId} onChange={(districtId) => props.onUpdate({ districtId })} /><PartyField label="Rival party" value={props.draft.rivalParty} actingParty={props.partyId} onChange={(rivalParty) => { if (rivalParty !== "") props.onUpdate({ rivalParty }); }} /></div>}
      {props.draft.operation === "court" && <PartyField label="Court target" value={props.draft.targetParty} actingParty={props.partyId} onChange={(targetParty) => { if (targetParty !== "") props.onUpdate({ targetParty }); }} />}
      {bonusAvailable && (
        <label className="bonus-check"><input type="checkbox" checked={props.draft.claimBonus} disabled={props.anotherBonus} onChange={(event) => props.onUpdate({ claimBonus: event.target.checked })} /><span><b>{bonus.name}</b>{bonus.effect}</span></label>
      )}
      {props.draft.claimBonus && <BonusFields draft={props.draft} partyId={props.partyId} onUpdate={props.onUpdate} />}
    </fieldset>
  );
}

function BonusFields(props: { draft: OperationDraft; partyId: PartyId; onUpdate(patch: Partial<OperationDraft>): void }) {
  const { draft, partyId } = props;
  if (partyId === "honeycomb" && draft.operation === "court") {
    return <div className="bonus-fields"><DistrictSelect label="Bonus source" value={draft.bonusSourceDistrictId} onChange={(bonusSourceDistrictId) => props.onUpdate({ bonusSourceDistrictId })} /><DistrictSelect label="Bonus destination" value={draft.bonusDistrictId} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} /></div>;
  }
  if (partyId === "foxglove" && draft.operation === "court") {
    return <PartyField label="Court source" optional value={draft.bonusCourtSourceParty} actingParty={partyId} onChange={(bonusCourtSourceParty) => props.onUpdate({ bonusCourtSourceParty })} />;
  }
  if (partyId === "riverworks" && draft.operation === "rally") {
    return <DistrictSelect label="Public Works district" value={draft.bonusDistrictId} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} />;
  }
  if (partyId === "many-wings" && draft.operation === "rally") {
    return <label>Scatter destinations<select multiple value={draft.bonusDistrictIds} onChange={(event) => props.onUpdate({ bonusDistrictIds: [...event.currentTarget.selectedOptions].map((option) => option.value) })}>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>;
  }
  if (partyId === "many-wings" && draft.operation === "court") {
    return <DistrictSelect label="Joint Campaign district" value={draft.bonusDistrictId} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} />;
  }
  if (partyId === "night-parliament" && draft.operation === "smear") {
    return <PartyField label="Rival Court space" optional value={draft.bonusCourtParty} actingParty={partyId} onChange={(bonusCourtParty) => props.onUpdate({ bonusCourtParty })} />;
  }
  return null;
}

function DistrictSelect(props: { label: string; value: string; optional?: boolean; onChange(value: string): void }) {
  return <label>{props.label}<select value={props.value} onChange={(event) => props.onChange(event.target.value)}><option value="">{props.optional ? "None / recovery" : "Choose district"}</option>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>;
}

function PartyField(props: { label: string; value: PartyId | ""; optional?: boolean; actingParty: PartyId; onChange(value: PartyId | ""): void }) {
  return <label>{props.label}<select value={props.value} onChange={(event) => props.onChange(event.target.value as PartyId | "")}>
    {props.optional && <option value="">Choose party</option>}
    {PARTIES.filter((party) => party.id !== props.actingParty).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
  </select></label>;
}

function PartySelect(props: { partyId: PartyId; partyIds: PartyId[]; onPartyId(partyId: PartyId): void }) {
  return <label>Party<select aria-label="Party" value={props.partyId} onChange={(event) => props.onPartyId(event.target.value as PartyId)}>{props.partyIds.map((partyId) => <option key={partyId} value={partyId}>{PARTIES_BY_ID[partyId].name}</option>)}</select></label>;
}

function ElectionBulletin({ view }: { view: GameView }) {
  const election = view.electionHistory.at(-1);
  if (election === undefined) return null;
  return (
    <section className="election-desk paper-panel">
      <SectionHeading label="Election special" title={`Election ${election.electionNumber}`} slug={`After Year ${election.afterYear}`} />
      <div className="election-scores">
        {election.scores.map((score) => {
          const seat = view.seats.find((candidate) => candidate.id === score.playerId);
          return <article key={score.playerId}><span>{seat?.displayName ?? score.playerId}</span><b>{signed(score.pointsChange)} points</b><small>District {score.baseDistrictScore} · Seat {signed(score.seatModifier)} · Capital {score.capitalScore} ({score.capitalMatches}/3)</small><strong>{score.resultingPoints} total</strong></article>;
        })}
      </div>
    </section>
  );
}

function YearArchive({ view }: { view: GameView }) {
  return (
    <section className="year-archive paper-panel">
      <SectionHeading label="Annual record" title="Year archive" slug={`${view.yearHistory.length} closed`} />
      {view.yearHistory.length === 0 ? <p>No year has closed.</p> : (
        <ol>{[...view.yearHistory].reverse().map((record) => <li key={record.year}><b>Year {record.year}</b><span>{seatName(view, record.endedBySeatId)} ended the year · {record.endReason === "passes" ? "all passed" : "majority closed"}</span><small>{record.actions.length} Lobby actions · {record.operations.length} Operations</small></li>)}</ol>
      )}
    </section>
  );
}

function ChatDesk(props: { view: GameView; busy: boolean; spectator: boolean; onCommand(command: GameCommand): Promise<boolean | void> }) {
  const [message, setMessage] = useState("");
  return (
    <section className="chat-desk paper-panel">
      <SectionHeading label="Back channel" title="Table talk" slug={`${props.view.chat.length} notes`} />
      <div className="chat-log">{props.view.chat.length === 0 ? <p>No messages filed.</p> : props.view.chat.map((entry) => <article key={entry.id}><b>{seatName(props.view, entry.seatId)}</b><p>{entry.text}</p></article>)}</div>
      {!props.spectator && <form className="chat-form" onSubmit={(event) => { event.preventDefault(); const trimmed = message.trim(); if (trimmed === "") return; void Promise.resolve(props.onCommand({ type: "post_chat", message: trimmed })).then((ok) => { if (ok !== false) setMessage(""); }); }}><label className="sr-only" htmlFor="chat-message">Message</label><input id="chat-message" value={message} maxLength={2_000} onChange={(event) => setMessage(event.target.value)} placeholder="Send a note to the table" /><button className="ink-button" disabled={props.busy || message.trim() === ""}>Send</button></form>}
    </section>
  );
}

function WaitingCopy({ view, observer = false }: { view: GameView; observer?: boolean }) {
  const active = activeSeat(view);
  return <div className="waiting-panel"><p className="section-label">{observer ? "Press gallery" : "Waiting"}</p><h3>{active === null ? "The record is being prepared." : `${seatName(view, active)} has the floor.`}</h3><p>{view.phase === "lobby" ? "Lobby turns move clockwise. Openings alone use the low-player snake order." : "The active desk must file before play continues."}</p></div>;
}

function SectionHeading(props: { label: string; title: string; slug: string }) {
  return <header className="section-heading"><div><p className="section-label">{props.label}</p><h2>{props.title}</h2></div><span className="phase-slug">{props.slug}</span></header>;
}

function ReplayArchiveView({ replay }: { replay: ReplayResponse }) {
  return <section className="replay-archive paper-panel"><SectionHeading label="Unsealed record" title="Replay archive" slug={`${replay.events.length} events`} /><ol>{replay.events.map((event) => <li key={event.eventId}><b>#{event.sequence}</b> {event.eventType} <small>{new Date(event.occurredAt).toLocaleString()}</small></li>)}</ol></section>;
}

export function extractView(envelope: ViewerStateEnvelope): GameView | null {
  if (envelope.publicState.lifecycle === "lobby") return null;
  const publicGame = objectValue(envelope.publicState.publicGame);
  if (publicGame["rulesetVersion"] !== RULESET_VERSION) {
    throw new Error(`This table uses an unsupported ruleset. Expected ${RULESET_VERSION}.`);
  }
  if (!Array.isArray(publicGame["seats"]) || !Array.isArray(publicGame["resolvedOperations"])) {
    throw new Error("The active game record is incomplete.");
  }
  const view = structuredClone(publicGame) as unknown as GameView;
  if (envelope.scope !== "seat") return view;
  const privateSeat = objectValue(objectValue(envelope.seatState.privateGame)["seat"]);
  if (typeof privateSeat["id"] !== "string") return view;
  return {
    ...view,
    seats: view.seats.map((seat) => seat.id === privateSeat["id"] ? { ...seat, ...privateSeat } as ViewSeat : seat)
  };
}

function previewDrafts(
  initial: OperationState,
  partyId: PartyId,
  drafts: OperationDraft[],
  inventory: ViewSeat["operations"]
): {
  plays: Array<{ operation: OperationId; choice: OperationChoice; claimBonus?: boolean }> | null;
  message: string | null;
} {
  if (drafts.length < 1 || drafts.length > 3) return { plays: null, message: null };
  if (inventory === null) return { plays: null, message: "Your private hand is unavailable." };
  const used = operationUsage(drafts);
  for (const operation of OPERATION_IDS) {
    if (used[operation] > inventory[operation]) return { plays: null, message: `You do not have enough ${operation} cards.` };
  }
  if (drafts.filter((draft) => draft.claimBonus).length > 1) return { plays: null, message: "Only one party bonus may be used in an Operate action." };
  let state = initial;
  const plays: Array<{ operation: OperationId; choice: OperationChoice; claimBonus?: boolean }> = [];
  for (const [index, draft] of drafts.entries()) {
    const choice = draftChoice(draft);
    if (choice === null) return { plays: null, message: `Card ${index + 1} needs a complete choice.` };
    const resolution = resolveOperation(state, { party: partyId, choice, claimBonus: draft.claimBonus });
    if (!resolution.baselineApplied || (draft.claimBonus && !resolution.bonusApplied)) {
      return { plays: null, message: `Card ${index + 1}: ${resolution.bonusFailure ?? resolution.failure ?? "illegal choice"}.` };
    }
    state = resolution.state;
    plays.push({ operation: draft.operation, choice, ...(draft.claimBonus ? { claimBonus: true } : {}) });
  }
  return { plays, message: "All cards resolve in the listed order." };
}

function draftChoice(draft: OperationDraft): OperationChoice | null {
  if (draft.operation === "organise") {
    if (draft.destinationDistrictId === "") return null;
    return { operation: "organise", destinationDistrictId: draft.destinationDistrictId, ...(draft.sourceDistrictId === "" ? {} : { sourceDistrictId: draft.sourceDistrictId }) };
  }
  if (draft.operation === "rally") {
    if (draft.districtId === "") return null;
    return { operation: "rally", districtId: draft.districtId, ...(draft.bonusDistrictId === "" ? {} : { bonusDistrictId: draft.bonusDistrictId }), ...(draft.bonusDistrictIds.length === 0 ? {} : { bonusDistrictIds: draft.bonusDistrictIds }) };
  }
  if (draft.operation === "smear") {
    if (draft.districtId === "") return null;
    return { operation: "smear", districtId: draft.districtId, rivalParty: draft.rivalParty, ...(draft.bonusCourtParty === "" ? {} : { bonusCourtParty: draft.bonusCourtParty }) };
  }
  return { operation: "court", targetParty: draft.targetParty, ...(draft.bonusDistrictId === "" ? {} : { bonusDistrictId: draft.bonusDistrictId }), ...(draft.bonusSourceDistrictId === "" ? {} : { bonusSourceDistrictId: draft.bonusSourceDistrictId }), ...(draft.bonusCourtSourceParty === "" ? {} : { bonusCourtSourceParty: draft.bonusCourtSourceParty }) };
}

function emptyOperationDraft(
  id: number,
  operation: OperationId,
  actingParty: PartyId
): OperationDraft {
  const target = PARTIES.find((party) => party.id !== actingParty)!.id;
  return { id, operation, sourceDistrictId: "", destinationDistrictId: "", districtId: "", rivalParty: target, targetParty: target, bonusDistrictId: "", bonusDistrictIds: [], bonusSourceDistrictId: "", bonusCourtSourceParty: "", bonusCourtParty: "", claimBonus: false };
}

function toOperationState(view: GameView): OperationState {
  return {
    districts: Object.fromEntries(DISTRICTS.map((district) => [district.id, { id: district.id, capacity: district.capacity, neighbors: [...district.adjacentDistrictIds], support: { ...view.support[district.id] } }])),
    courtSupport: structuredClone(view.courtSupport),
    coalitionTargets: { ...view.coalitionTargets }
  };
}

function operationUsage(drafts: OperationDraft[]): Record<OperationId, number> {
  return Object.fromEntries(OPERATION_IDS.map((operation) => [operation, drafts.filter((draft) => draft.operation === operation).length])) as Record<OperationId, number>;
}

function operationCount(inventory: Record<OperationId, number>): number {
  return OPERATION_IDS.reduce((total, operation) => total + inventory[operation], 0);
}

function activeSeat(view: GameView): string | null {
  if (view.phaseData.type === "opening") return view.phaseData.turnSeatIds[view.phaseData.turnIndex] ?? null;
  if (view.phaseData.type === "lobby") return view.phaseData.activeSeatId;
  return null;
}

function turnSlug(view: GameView): string {
  const active = activeSeat(view);
  if (active !== null) return seatName(view, active);
  if (view.phase === "election") return "Cleanup complete";
  return "Final edition";
}

function rotateSeats(seats: ViewSeat[], firstSeatId: string): ViewSeat[] {
  const index = seats.findIndex((seat) => seat.id === firstSeatId);
  return index < 1 ? seats : [...seats.slice(index), ...seats.slice(0, index)];
}

function seatName(view: GameView, seatId: string): string {
  return view.seats.find((seat) => seat.id === seatId)?.displayName ?? seatId;
}

function phaseName(phase: GameView["phase"]): string {
  if (phase === "opening") return "Party Openings";
  if (phase === "lobby") return "Lobby Actions";
  if (phase === "election") return "Election";
  return "Complete";
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The desk returned an unknown error.";
}

function loadSession(): ParticipantSession | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored === null ? null : JSON.parse(stored) as ParticipantSession;
  } catch {
    return null;
  }
}

function leave(setSession: (session: ParticipantSession | null) => void): void {
  localStorage.removeItem(SESSION_KEY);
  setSession(null);
}

function LoadingDesk(props: { error: string | null; onLeave(): void }) {
  return <main className="loading-page"><p className="kicker">The Bellweather Register</p><h1>Pulling the file.</h1>{props.error !== null && <p className="form-error">{props.error}</p>}<button className="text-button" onClick={props.onLeave}>Return to front page</button></main>;
}
