import {
  DISTRICTS,
  FIRMS_BY_ID,
  OPERATION_IDS,
  PARTIES,
  PARTIES_BY_ID,
  RULESET_VERSION,
  SCORING_CARDS_BY_ID,
  type DistrictId,
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
  isOperationChoiceLegal,
  isOperationRequestLegal,
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
  useId,
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

type OperationTarget =
  | "actingParty"
  | "sourceDistrictId"
  | "destinationDistrictId"
  | "districtId"
  | "rivalParty"
  | "targetParty"
  | "bonusDistrictId"
  | "bonusDistrictIds"
  | "bonusSourceDistrictId"
  | "bonusCourtSourceParty"
  | "bonusCourtParty";

interface TableInteraction {
  prompt: string;
  partyIds?: PartyId[];
  selectedPartyIds?: PartyId[];
  districtIds?: DistrictId[];
  selectedDistrictIds?: DistrictId[];
  supportIds?: string[] | undefined;
  onPartyClick?: ((partyId: PartyId) => void) | undefined;
  onDistrictClick?: ((districtId: DistrictId) => void) | undefined;
  onSupportClick?: ((districtId: DistrictId, partyId: PartyId) => void) | undefined;
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
  const [interaction, setInteraction] = useState<TableInteraction | null>(null);
  return (
    <main className="game-grid">
      <PrivateFolio view={props.view} seat={props.ownSeat} spectator={props.spectator} />
      <section className="map-desk paper-panel">
        <SectionHeading label="Constituency wire" title="Bellweather map" slug={`Year ${props.view.year}`} />
        {interaction !== null && <p className="map-instruction">{interaction.prompt}</p>}
        <PartyBoard view={props.view} interaction={interaction} />
        <DistrictMap view={props.view} interaction={interaction} />
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
            onInteraction={setInteraction}
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

export function PartyBoard({
  view,
  interaction = null
}: {
  view: GameView;
  interaction?: TableInteraction | null;
}) {
  const targeting = interaction?.onPartyClick !== undefined;
  return (
    <div className="party-board" aria-label="Party access and Operation piles">
      {PARTIES.map((party) => {
        const state = view.parties[party.id];
        const owner = view.seats.find((seat) => seat.id === state?.ownerSeatId);
        const pile = state === undefined ? 0 : operationCount(state.operations);
        const selectable = interaction?.partyIds?.includes(party.id) === true;
        const selected = interaction?.selectedPartyIds?.includes(party.id) === true;
        return (
          <article
            key={party.id}
            className={`party-file ${state?.status === "closed" ? "party-file-closed" : ""} ${targeting ? "table-target" : ""} ${selectable ? "table-selectable" : ""} ${selected ? "table-selected" : ""}`}
            style={{ "--party": party.color } as CSSProperties}
            role={targeting ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            aria-disabled={targeting && !selectable ? true : undefined}
            aria-pressed={targeting ? selected : undefined}
            onClick={() => { if (selectable) interaction?.onPartyClick?.(party.id); }}
            onKeyDown={(event) => {
              if (selectable && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                interaction?.onPartyClick?.(party.id);
              }
            }}
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

export function DistrictMap({
  view,
  interaction = null
}: {
  view: GameView;
  interaction?: TableInteraction | null;
}) {
  const targeting = interaction?.onDistrictClick !== undefined;
  return (
    <div className="district-map" aria-label="Bellweather district map">
      {DISTRICTS.map((district) => {
        const support = view.support[district.id] ?? {};
        const occupied = PARTIES.reduce((total, party) => total + (support[party.id] ?? 0), 0);
        const selectable = interaction?.districtIds?.includes(district.id) === true;
        const selected = interaction?.selectedDistrictIds?.includes(district.id) === true;
        const summary = `${district.name}: ${occupied} of ${district.capacity} Support spaces occupied`;
        return (
          <article
            key={district.id}
            className={`district district-${district.id} ${targeting ? "table-target" : ""} ${targeting && !selectable ? "table-unavailable" : ""} ${selectable ? "table-selectable" : ""} ${selected ? "table-selected" : ""}`}
            aria-label={targeting ? undefined : summary}
          >
            {targeting ? (
              <button
                type="button"
                className="district-target-button"
                aria-label={summary}
                aria-disabled={!selectable}
                aria-pressed={selected}
                tabIndex={selectable ? 0 : -1}
                onClick={() => { if (selectable) interaction?.onDistrictClick?.(district.id); }}
              ><strong>{district.name}</strong><small>{occupied}/{district.capacity} support</small></button>
            ) : (
              <div className="district-heading"><strong>{district.name}</strong><small>{occupied}/{district.capacity} support</small></div>
            )}
            <div className="support-groups">
              {PARTIES.map((party) => {
                if ((support[party.id] ?? 0) < 1) return null;
                const content = <><PartyEmblem partyId={party.id} />{support[party.id]}</>;
                const style = { "--party": party.color } as CSSProperties;
                const title = `${party.shortName}: ${support[party.id]}`;
                if (interaction?.onSupportClick === undefined) {
                  return <span key={party.id} style={style} title={title}>{content}</span>;
                }
                const supportId = supportTargetId(district.id, party.id);
                const supportSelectable = interaction.supportIds?.includes(supportId) === true;
                return (
                  <button
                    type="button"
                    key={party.id}
                    className={supportSelectable ? "support-selectable" : ""}
                    style={style}
                    title={title}
                    aria-label={`${party.shortName} Support in ${district.name}: ${support[party.id]}`}
                    disabled={!supportSelectable}
                    onClick={() => interaction.onSupportClick?.(district.id, party.id)}
                  >{content}</button>
                );
              })}
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
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
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
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
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
  const availablePartyKey = availableParties.map((party) => party.id).join(",");
  useEffect(() => {
    if (active !== props.seatId || props.onInteraction === undefined) return;
    props.onInteraction({
      prompt: "Select an unopened party, then confirm the Firm placement at the active desk.",
      partyIds: availableParties.map((party) => party.id),
      selectedPartyIds: partyId === "" ? [] : [partyId as PartyId],
      onPartyClick: (selected) => setPartyId(selected)
    });
    return () => props.onInteraction?.(null);
  }, [active, availablePartyKey, partyId, props.onInteraction, props.seatId]);

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
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
}) {
  const active = props.view.phaseData.type === "lobby" ? props.view.phaseData.activeSeatId : undefined;
  const [mode, setMode] = useState<"operate" | "collect" | "close" | "pass">("operate");
  const sequence = props.view.phaseData.type === "lobby"
    ? props.view.phaseData.inProgressOperate
    : null;
  const openPartyIds = PARTIES.map((party) => party.id).filter((partyId) => props.view.parties[partyId]?.status === "open");
  const [partyId, setPartyId] = useState<PartyId>(openPartyIds[0] ?? "honeycomb");
  useEffect(() => {
    if (!openPartyIds.includes(partyId)) setPartyId(openPartyIds[0] ?? "honeycomb");
  }, [openPartyIds, partyId]);
  useEffect(() => {
    if (sequence !== null) {
      setMode("operate");
      setPartyId(sequence.partyId);
    }
  }, [sequence?.partyId]);
  if (active !== props.seatId) return <WaitingCopy view={props.view} />;

  const party = props.view.parties[partyId];
  const firstTurn = props.view.phaseData.type === "lobby" && (props.view.phaseData.turnsTaken[props.seatId] ?? 0) === 0;
  const collectTargetPartyIds = props.seat.collectionCounters < 1
    ? []
    : openPartyIds.filter((candidate) => operationCount(props.view.parties[candidate]!.operations) > 0);
  const closeTargetPartyIds = firstTurn
    ? []
    : openPartyIds.filter((candidate) => props.view.parties[candidate]?.ownerSeatId === props.seatId);
  const collectLegal = party !== undefined && operationCount(party.operations) > 0 && props.seat.collectionCounters > 0;
  const closeLegal = party !== undefined && party.ownerSeatId === props.seatId && !firstTurn;
  return (
    <div className="lobby-action-desk">
      <div className="action-tabs" role="tablist" aria-label="Lobby actions">
        {(["operate", "collect", "close", "pass"] as const).map((action) => (
          <button key={action} type="button" disabled={sequence !== null && action !== "operate"} className={mode === action ? "active" : ""} onClick={() => setMode(action)}>{action}</button>
        ))}
      </div>
      {mode === "operate" && (
        <OperationComposer view={props.view} seat={props.seat} partyId={partyId} onPartyId={setPartyId} busy={props.busy} onInteraction={props.onInteraction} onSubmit={(play) => props.onCommand({ type: "game_action", action: { type: "operate", partyId, play } })} onFinish={() => props.onCommand({ type: "game_action", action: { type: "finish_operate" } })} />
      )}
      {mode === "collect" && (
        <SimplePartyAction title="Collect" copy="Spend one Collection counter and take the complete public pile into your New Year area. The party stays open." partyId={partyId} onPartyId={setPartyId} partyIds={openPartyIds} targetPartyIds={collectTargetPartyIds} disabled={props.busy || !collectLegal} button={`Collect ${party === undefined ? 0 : operationCount(party.operations)} cards`} onInteraction={props.onInteraction} onSubmit={() => props.onCommand({ type: "game_action", action: { type: "collect", partyId } })} />
      )}
      {mode === "close" && (
        <SimplePartyAction title="Close" copy={firstTurn ? "You cannot Close on your first Lobby turn, even if you previously passed." : "Only the opening Firm may Close. Its owner takes the pile into their New Year area."} partyId={partyId} onPartyId={setPartyId} partyIds={openPartyIds} targetPartyIds={closeTargetPartyIds} disabled={props.busy || !closeLegal} button="Close party" onInteraction={props.onInteraction} onSubmit={() => props.onCommand({ type: "game_action", action: { type: "close", partyId } })} />
      )}
      {mode === "pass" && (
        <PassAction busy={props.busy} onInteraction={props.onInteraction} onPass={() => props.onCommand({ type: "game_action", action: { type: "pass" } })} />
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
  targetPartyIds: PartyId[];
  disabled: boolean;
  button: string;
  onSubmit(): Promise<boolean | void>;
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
}) {
  const targetPartyKey = props.targetPartyIds.join(",");
  useEffect(() => {
    if (props.onInteraction === undefined) return;
    props.onInteraction({
      prompt: `Select a party for ${props.title}, then confirm at the active desk.`,
      partyIds: props.targetPartyIds,
      selectedPartyIds: [props.partyId],
      onPartyClick: props.onPartyId
    });
    return () => props.onInteraction?.(null);
  }, [targetPartyKey, props.onInteraction, props.onPartyId, props.partyId, props.title]);
  return (
    <form onSubmit={(event) => { event.preventDefault(); void props.onSubmit(); }}>
      <div className="action-copy"><h3>{props.title}</h3><p>{props.copy}</p></div>
      <PartySelect partyId={props.partyId} partyIds={props.partyIds} onPartyId={props.onPartyId} />
      <button className="red-button" disabled={props.disabled}>{props.button}</button>
    </form>
  );
}

function PassAction(props: {
  busy: boolean;
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
  onPass(): Promise<boolean | void>;
}) {
  useEffect(() => {
    props.onInteraction?.(null);
  }, [props.onInteraction]);
  return (
    <div className="action-copy">
      <h3>Pass</h3>
      <p>If every player passes consecutively, every party closes to its opening Firm and the year ends.</p>
      <button className="red-button" disabled={props.busy} onClick={() => void props.onPass()}>Pass this turn</button>
    </div>
  );
}

export function OperationComposer(props: {
  view: GameView;
  seat: ViewSeat;
  partyId: PartyId;
  onPartyId(partyId: PartyId): void;
  busy: boolean;
  onSubmit(play: { operation: OperationId; choice: OperationChoice; claimBonus?: boolean }): Promise<boolean | void>;
  onFinish(): Promise<boolean | void>;
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
}) {
  const nextId = useRef(1);
  const sequence = props.view.phaseData.type === "lobby"
    ? props.view.phaseData.inProgressOperate
    : null;
  const resolvedCount = sequence?.operationCount ?? 0;
  const [draft, setDraft] = useState<OperationDraft>(() =>
    emptyOperationDraft(nextId.current++, "organise", props.partyId)
  );
  const [armedTarget, setArmedTarget] = useState<OperationTarget>("sourceDistrictId");
  const lobbyTurn = props.view.phaseData.type === "lobby"
    ? props.view.phaseData.turn
    : 0;
  useEffect(() => {
    setDraft((current) => emptyOperationDraft(nextId.current++, current.operation, props.partyId));
    setArmedTarget(defaultOperationTarget(draft.operation));
  }, [props.partyId, props.view.year, lobbyTurn, resolvedCount]);
  const operationState = useMemo(() => toOperationState(props.view), [props.view]);
  const preview = useMemo(
    () => previewDraft(operationState, props.partyId, draft, props.seat.operations),
    [operationState, props.partyId, draft, props.seat.operations]
  );
  const openPartyIds = PARTIES.map((party) => party.id).filter((partyId) => props.view.parties[partyId]?.status === "open");
  const claimedBonuses = props.view.parties[props.partyId]?.claimedBonuses ?? [];
  const partyLocked = sequence !== null;
  const chooseOperation = (operation: OperationId) => {
    setDraft(emptyOperationDraft(nextId.current++, operation, props.partyId));
    setArmedTarget(defaultOperationTarget(operation));
  };
  const update = (patch: Partial<OperationDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const interactionKey = JSON.stringify([
    armedTarget,
    draft,
    props.partyId,
    partyLocked,
    openPartyIds,
    props.view.support,
    props.view.courtSupport,
    props.view.coalitionTargets
  ]);
  useEffect(() => {
    if (props.onInteraction === undefined) return;
    props.onInteraction(operationTableInteraction({
      state: operationState,
      partyId: props.partyId,
      openPartyIds,
      partyLocked,
      draft,
      armedTarget,
      onPartyId: props.onPartyId,
      onDraft: update
    }));
    return () => props.onInteraction?.(null);
  }, [interactionKey, props.onInteraction]);

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (preview.play !== null) void props.onSubmit(preview.play);
    }}>
      <p className="action-lede">Resolve one Operation now. After it changes the board, either resolve another at this party or finish your action.</p>
      <p className="operation-progress">Card {resolvedCount + 1} of up to 3 · {sequence?.bonusClaimed === true ? "bonus already used" : "one bonus available"}</p>
      <PartySelect partyId={props.partyId} partyIds={openPartyIds} onPartyId={props.onPartyId} disabled={partyLocked} active={armedTarget === "actingParty"} onArm={() => setArmedTarget("actingParty")} />
      <div className="operation-adders" aria-label="Choose an Operation card">
        {OPERATION_IDS.map((operation) => (
          <button type="button" key={operation} className={draft.operation === operation ? "active" : ""} disabled={(props.seat.operations?.[operation] ?? 0) < 1} onClick={() => chooseOperation(operation)}>
            {operation} <b>{props.seat.operations?.[operation] ?? 0}</b>
          </button>
        ))}
      </div>
      <OperationDraftCard
        index={resolvedCount}
        draft={draft}
        partyId={props.partyId}
        claimedBonuses={claimedBonuses}
        bonusBlocked={sequence?.bonusClaimed === true}
        armedTarget={armedTarget}
        onArm={setArmedTarget}
        onUpdate={update}
      />
      {preview.message !== null && <p className="validation-copy">{preview.message}</p>}
      <div className="button-row">
        <button className="red-button" disabled={props.busy || preview.play === null}>Resolve {draft.operation}</button>
        {sequence !== null && <button type="button" className="ink-button" disabled={props.busy} onClick={() => void props.onFinish()}>Finish Operate</button>}
      </div>
    </form>
  );
}

function OperationDraftCard(props: {
  index: number;
  draft: OperationDraft;
  partyId: PartyId;
  claimedBonuses: OperationId[];
  bonusBlocked: boolean;
  armedTarget: OperationTarget;
  onArm(target: OperationTarget): void;
  onUpdate(patch: Partial<OperationDraft>): void;
}) {
  const bonus = PARTIES_BY_ID[props.partyId].bonuses.find((candidate) => candidate.operation === props.draft.operation);
  const bonusAvailable = bonus !== undefined && !props.claimedBonuses.includes(props.draft.operation);
  return (
    <fieldset className="operation-card">
      <legend>{props.index + 1}. {props.draft.operation}</legend>
      {props.draft.operation === "organise" && (
        <div className="field-grid"><DistrictSelect label="Source" optional value={props.draft.sourceDistrictId} active={props.armedTarget === "sourceDistrictId"} onArm={() => props.onArm("sourceDistrictId")} onChange={(sourceDistrictId) => props.onUpdate({ sourceDistrictId })} /><DistrictSelect label="Destination" value={props.draft.destinationDistrictId} active={props.armedTarget === "destinationDistrictId"} onArm={() => props.onArm("destinationDistrictId")} onChange={(destinationDistrictId) => props.onUpdate({ destinationDistrictId })} /></div>
      )}
      {props.draft.operation === "rally" && <DistrictSelect label="Rally district" value={props.draft.districtId} active={props.armedTarget === "districtId"} onArm={() => props.onArm("districtId")} onChange={(districtId) => props.onUpdate({ districtId })} />}
      {props.draft.operation === "smear" && <div className="field-grid"><DistrictSelect label="District" value={props.draft.districtId} active={props.armedTarget === "districtId"} onArm={() => props.onArm("districtId")} onChange={(districtId) => props.onUpdate({ districtId })} /><PartyField label="Rival party" value={props.draft.rivalParty} actingParty={props.partyId} active={props.armedTarget === "rivalParty"} onArm={() => props.onArm("rivalParty")} onChange={(rivalParty) => { if (rivalParty !== "") props.onUpdate({ rivalParty }); }} /></div>}
      {props.draft.operation === "court" && <PartyField label="Court target" value={props.draft.targetParty} actingParty={props.partyId} active={props.armedTarget === "targetParty"} onArm={() => props.onArm("targetParty")} onChange={(targetParty) => { if (targetParty !== "") props.onUpdate({ targetParty }); }} />}
      {bonusAvailable && (
        <label className="bonus-check"><input type="checkbox" checked={props.draft.claimBonus} disabled={props.bonusBlocked} onChange={(event) => props.onUpdate({ claimBonus: event.target.checked })} /><span><b>{bonus.name}</b>{bonus.effect}</span></label>
      )}
      {props.draft.claimBonus && <BonusFields draft={props.draft} partyId={props.partyId} armedTarget={props.armedTarget} onArm={props.onArm} onUpdate={props.onUpdate} />}
    </fieldset>
  );
}

function BonusFields(props: { draft: OperationDraft; partyId: PartyId; armedTarget: OperationTarget; onArm(target: OperationTarget): void; onUpdate(patch: Partial<OperationDraft>): void }) {
  const { draft, partyId } = props;
  const scatterId = useId();
  if (partyId === "honeycomb" && draft.operation === "court") {
    return <div className="bonus-fields"><DistrictSelect label="Bonus source" value={draft.bonusSourceDistrictId} active={props.armedTarget === "bonusSourceDistrictId"} onArm={() => props.onArm("bonusSourceDistrictId")} onChange={(bonusSourceDistrictId) => props.onUpdate({ bonusSourceDistrictId })} /><DistrictSelect label="Bonus destination" value={draft.bonusDistrictId} active={props.armedTarget === "bonusDistrictId"} onArm={() => props.onArm("bonusDistrictId")} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} /></div>;
  }
  if (partyId === "foxglove" && draft.operation === "court") {
    return <PartyField label="Court source" optional value={draft.bonusCourtSourceParty} actingParty={partyId} active={props.armedTarget === "bonusCourtSourceParty"} onArm={() => props.onArm("bonusCourtSourceParty")} onChange={(bonusCourtSourceParty) => props.onUpdate({ bonusCourtSourceParty })} />;
  }
  if (partyId === "riverworks" && draft.operation === "rally") {
    return <DistrictSelect label="Public Works district" value={draft.bonusDistrictId} active={props.armedTarget === "bonusDistrictId"} onArm={() => props.onArm("bonusDistrictId")} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} />;
  }
  if (partyId === "many-wings" && draft.operation === "rally") {
    return <div className={`target-field ${props.armedTarget === "bonusDistrictIds" ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={scatterId}>Scatter destinations</label><button type="button" className="target-arm" onClick={() => props.onArm("bonusDistrictIds")}>Select on map</button></div><select id={scatterId} multiple value={draft.bonusDistrictIds} onFocus={() => props.onArm("bonusDistrictIds")} onChange={(event) => props.onUpdate({ bonusDistrictIds: [...event.currentTarget.selectedOptions].map((option) => option.value) })}>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div>;
  }
  if (partyId === "many-wings" && draft.operation === "court") {
    return <DistrictSelect label="Joint Campaign district" value={draft.bonusDistrictId} active={props.armedTarget === "bonusDistrictId"} onArm={() => props.onArm("bonusDistrictId")} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} />;
  }
  if (partyId === "night-parliament" && draft.operation === "smear") {
    return <PartyField label="Rival Court space" optional value={draft.bonusCourtParty} actingParty={partyId} active={props.armedTarget === "bonusCourtParty"} onArm={() => props.onArm("bonusCourtParty")} onChange={(bonusCourtParty) => props.onUpdate({ bonusCourtParty })} />;
  }
  return null;
}

function DistrictSelect(props: { label: string; value: string; optional?: boolean; active?: boolean; onArm?(): void; onChange(value: string): void }) {
  const id = useId();
  return <div className={`target-field ${props.active ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={id}>{props.label}</label>{props.onArm !== undefined && <button type="button" className="target-arm" onClick={props.onArm}>Select on map</button>}</div><select id={id} value={props.value} onFocus={props.onArm} onChange={(event) => props.onChange(event.target.value)}><option value="">{props.optional ? "None / recovery" : "Choose district"}</option>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div>;
}

function PartyField(props: { label: string; value: PartyId | ""; optional?: boolean; actingParty: PartyId; active?: boolean; onArm?(): void; onChange(value: PartyId | ""): void }) {
  const id = useId();
  return <div className={`target-field ${props.active ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={id}>{props.label}</label>{props.onArm !== undefined && <button type="button" className="target-arm" onClick={props.onArm}>Select party file</button>}</div><select id={id} value={props.value} onFocus={props.onArm} onChange={(event) => props.onChange(event.target.value as PartyId | "")}>
    {props.optional && <option value="">Choose party</option>}
    {PARTIES.filter((party) => party.id !== props.actingParty).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
  </select></div>;
}

function PartySelect(props: { partyId: PartyId; partyIds: PartyId[]; onPartyId(partyId: PartyId): void; disabled?: boolean; active?: boolean; onArm?(): void }) {
  const id = useId();
  return <div className={`target-field ${props.active ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={id}>Party</label>{props.onArm !== undefined && !props.disabled && <button type="button" className="target-arm" onClick={props.onArm}>Select party file</button>}</div><select id={id} aria-label="Party" value={props.partyId} disabled={props.disabled} onFocus={props.onArm} onChange={(event) => props.onPartyId(event.target.value as PartyId)}>{props.partyIds.map((partyId) => <option key={partyId} value={partyId}>{PARTIES_BY_ID[partyId].name}</option>)}</select></div>;
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

function previewDraft(
  initial: OperationState,
  partyId: PartyId,
  draft: OperationDraft,
  inventory: ViewSeat["operations"]
): {
  play: { operation: OperationId; choice: OperationChoice; claimBonus?: boolean } | null;
  message: string | null;
} {
  if (inventory === null) return { play: null, message: "Your private hand is unavailable." };
  if (inventory[draft.operation] < 1) {
    return { play: null, message: `You do not have a ${draft.operation} card.` };
  }
  const choice = draftChoice(draft);
  if (choice === null) return { play: null, message: "Choose every required target." };
  const resolution = resolveOperation(initial, {
    party: partyId,
    choice,
    claimBonus: draft.claimBonus
  });
  if (!resolution.baselineApplied || (draft.claimBonus && !resolution.bonusApplied)) {
    return {
      play: null,
      message: resolution.bonusFailure ?? resolution.failure ?? "That choice is illegal."
    };
  }
  return {
    play: {
      operation: draft.operation,
      choice,
      ...(draft.claimBonus ? { claimBonus: true } : {})
    },
    message: "Ready to resolve this card."
  };
}

function operationTableInteraction(input: {
  state: OperationState;
  partyId: PartyId;
  openPartyIds: PartyId[];
  partyLocked: boolean;
  draft: OperationDraft;
  armedTarget: OperationTarget;
  onPartyId(partyId: PartyId): void;
  onDraft(patch: Partial<OperationDraft>): void;
}): TableInteraction {
  const { armedTarget, draft, partyId, state } = input;
  const prompt = targetPrompt(armedTarget);
  if (armedTarget === "actingParty") {
    return {
      prompt,
      partyIds: input.partyLocked ? [] : input.openPartyIds,
      selectedPartyIds: [partyId],
      onPartyClick: input.partyLocked ? undefined : input.onPartyId
    };
  }
  if (isPartyTarget(armedTarget)) {
    const partyIds = legalPartyTargets(state, partyId, draft, armedTarget);
    return {
      prompt,
      partyIds,
      selectedPartyIds: selectedPartyTargets(draft, armedTarget),
      onPartyClick: (selected) => input.onDraft({ [armedTarget]: selected })
    };
  }

  const districtIds = legalDistrictTargets(state, partyId, draft, armedTarget);
  const selectedDistrictIds = selectedDistrictTargets(draft, armedTarget);
  const supportIds = draft.operation === "smear" && armedTarget === "districtId"
    ? legalSmearSupportTargets(state, partyId)
    : undefined;
  return {
    prompt,
    districtIds,
    selectedDistrictIds,
    supportIds,
    onDistrictClick: (selected) => {
      if (armedTarget === "bonusDistrictIds") {
        const current = draft.bonusDistrictIds;
        input.onDraft({
          bonusDistrictIds: current.includes(selected)
            ? current.filter((districtId) => districtId !== selected)
            : [...current, selected]
        });
        return;
      }
      input.onDraft({ [armedTarget]: selected });
    },
    onSupportClick: supportIds === undefined
      ? undefined
      : (districtId, rivalParty) => input.onDraft({ districtId, rivalParty })
  };
}

function legalDistrictTargets(
  state: OperationState,
  partyId: PartyId,
  draft: OperationDraft,
  target: OperationTarget
): DistrictId[] {
  if (target === "bonusDistrictIds") {
    const rallyDistrict = state.districts[draft.districtId];
    if (rallyDistrict === undefined) return [];
    return rallyDistrict.neighbors.filter((districtId): districtId is DistrictId => {
      const district = state.districts[districtId];
      return district !== undefined && districtOccupancy(district.support) < district.capacity;
    });
  }
  return DISTRICTS.map((district) => district.id).filter((districtId) => {
    const candidate = { ...draft, [target]: districtId };
    if (target === "sourceDistrictId" && candidate.destinationDistrictId === "") {
      return (state.districts[districtId]?.support[partyId] ?? 0) > 0;
    }
    if (target === "bonusSourceDistrictId" && candidate.bonusDistrictId === "") {
      return (state.districts[districtId]?.support[partyId] ?? 0) > 0;
    }
    const choice = draftChoice(candidate);
    if (choice === null) return false;
    return target.startsWith("bonus")
      ? isOperationRequestLegal(state, { party: partyId, choice, claimBonus: true })
      : isOperationChoiceLegal(state, partyId, choice);
  });
}

function legalPartyTargets(
  state: OperationState,
  partyId: PartyId,
  draft: OperationDraft,
  target: OperationTarget
): PartyId[] {
  return PARTIES.map((party) => party.id).filter((candidateParty) => {
    if (candidateParty === partyId) return false;
    if (target === "targetParty") return true;
    if (target === "rivalParty" && draft.districtId === "") return true;
    if (target === "bonusCourtSourceParty" && draft.targetParty === candidateParty) {
      return false;
    }
    const candidate = { ...draft, [target]: candidateParty };
    const choice = draftChoice(candidate);
    if (choice === null) return false;
    return target.startsWith("bonus")
      ? isOperationRequestLegal(state, { party: partyId, choice, claimBonus: true })
      : isOperationChoiceLegal(state, partyId, choice);
  });
}

function legalSmearSupportTargets(
  state: OperationState,
  partyId: PartyId
): string[] {
  return DISTRICTS.flatMap((district) =>
    PARTIES.filter((party) =>
      party.id !== partyId &&
      isOperationChoiceLegal(state, partyId, {
        operation: "smear",
        districtId: district.id,
        rivalParty: party.id
      })
    ).map((party) => supportTargetId(district.id, party.id))
  );
}

function selectedDistrictTargets(
  draft: OperationDraft,
  target: OperationTarget
): DistrictId[] {
  if (target === "bonusDistrictIds") return draft.bonusDistrictIds as DistrictId[];
  const value = draft[target as keyof OperationDraft];
  return typeof value === "string" && value !== "" ? [value as DistrictId] : [];
}

function selectedPartyTargets(
  draft: OperationDraft,
  target: OperationTarget
): PartyId[] {
  const value = draft[target as keyof OperationDraft];
  return typeof value === "string" && value !== "" ? [value as PartyId] : [];
}

function isPartyTarget(target: OperationTarget): target is Extract<OperationTarget,
  "rivalParty" | "targetParty" | "bonusCourtSourceParty" | "bonusCourtParty"
> {
  return ["rivalParty", "targetParty", "bonusCourtSourceParty", "bonusCourtParty"].includes(target);
}

function defaultOperationTarget(operation: OperationId): OperationTarget {
  if (operation === "organise") return "sourceDistrictId";
  if (operation === "court") return "targetParty";
  return "districtId";
}

function targetPrompt(target: OperationTarget): string {
  const labels: Record<OperationTarget, string> = {
    actingParty: "Select the party where this Operate action will resolve.",
    sourceDistrictId: "Select the Organise source district on the map.",
    destinationDistrictId: "Select the Organise destination district on the map.",
    districtId: "Select a district on the map. For Smear, click rival Support to fill both targets.",
    rivalParty: "Select the rival party file. To choose both targets together, arm District and click rival Support.",
    targetParty: "Select the Court target's party file.",
    bonusDistrictId: "Select the bonus district on the map.",
    bonusDistrictIds: "Select or deselect the required Scatter destinations on the map.",
    bonusSourceDistrictId: "Select the bonus source district on the map.",
    bonusCourtSourceParty: "Select the Court source party file.",
    bonusCourtParty: "Select the rival Court-space party file."
  };
  return labels[target];
}

function supportTargetId(districtId: string, partyId: PartyId): string {
  return `${districtId}:${partyId}`;
}

function districtOccupancy(support: Partial<Record<PartyId, number>>): number {
  return PARTIES.reduce((total, party) => total + (support[party.id] ?? 0), 0);
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
