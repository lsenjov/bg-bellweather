import { PolicyCard } from "./PolicyCard.js";
import {
  BONUS_CARDS_BY_ID,
  DISTRICTS,
  DISTRICTS_BY_ID,
  MAP_BRIDGES,
  REGION_NAMES, REGION_IDS, PARTY_PRIORITIES, POLICIES_BY_ID, LAW_EFFECTS, activeLawEffects, votesFor,
  type PolicyId,
  type RegionId,
  ELECTION_YEARS,
  FINAL_ELECTION_YEAR,
  FIRMS_BY_ID,
  OPERATION_IDS,
  PARTIES,
  PARTIES_BY_ID,
  RULESET_VERSION,
  SCORING_CARDS_BY_ID,
  type BonusCardId,
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
  type OperationPlay,
  type ParticipantSession,
  type ReplayResponse,
  type UnboundBonusChoice,
  type ViewerStateEnvelope
} from "@bellweather/protocol";
import {
  isOperationChoiceLegal, operationFollowUps, resolveUnboundBonus, type FollowUpId,
  isOperationRequestLegal,
  resolveOperation,
  scorePolicies,
  type GameView as EngineGameView,
  type OperationChoice,
  type OperationState,
  type ProjectedSeat,
  type SupportChange
} from "@bellweather/game";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  count: number;
  destinationDistrictId: string;
  districtId: string;
  rivalParty: PartyId;
  bonusDistrictId: string;
  bonusDistrictIds: string[];
  swapPartyIds: PartyId[];
  displacementDistrictId: string;
  freshStartDistrictId: string;
  chainSourceDistrictId: string;
  followUpOrder: FollowUpId[] | null;
  bonusCardId: BonusCardId | "";
  unbound: UnboundDraft;
}

interface UnboundDraft {
  regionId: RegionId;
  forPolicy: boolean;
  policyDistrictIds: Partial<Record<PartyId, string>>;
  districtId: string;
  sourceDistrictId: string;
  destinationDistrictId: string;
  partnerPartyId: PartyId | "";
  campaignMoves: Array<{ sourceDistrictId: string; partyId: PartyId | "" }>;
  sourceDistrictIds: string[];
  targetPartyId: PartyId | "";
  firmId: FirmId | "";
  transitDistrictIds: string[];
  transitSupportPartyIds: Array<PartyId | "">;
  destinationDistrictIds: string[];
}

type OperationTarget =
  | "actingParty"
  | "sourceDistrictId"
  | "destinationDistrictId"
  | "districtId"
  | "rivalParty"
  | "bonusDistrictId"
  | "bonusDistrictIds";

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
          <strong>{view === null ? "Lobby edition" : `Year ${view.year} / ${FINAL_ELECTION_YEAR}`}</strong>
          <small>Invite {state.publicState.inviteCode}</small>
        </div>
      </header>

      <nav className="ticker" aria-label="Game status">
        <span>Players {state.publicState.configuration.playerCount}</span>
        <span>Election {view?.electionNumber ?? 0} / 3</span>
        <span>{view === null ? "Assembling table" : phaseName(view.phase)}</span>
        <span>Election years {ELECTION_YEARS.join(" · ")}</span>
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
          Six years of access, operations, and political capital—filed one
          party at a time.
        </p>
        <div className="front-page-rule">
          <span>6 years</span><span>3 elections</span><span>6 parties</span>
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
          <li><b>Election</b><span>After Years 2, 4, and 6.</span></li>
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
  const latestAction = props.view.lobbyActions.at(-1) ?? null;
  const supportChanges = props.view.phase === "election" || props.view.phase === "complete"
    ? []
    : latestAction?.supportChanges ?? [];
  const [interaction, setInteraction] = useState<TableInteraction | null>(null);
  return (
    <main className="game-grid">
      <PrivateFolio view={props.view} seat={props.ownSeat} spectator={props.spectator} />
      <section className="map-desk paper-panel">
        <SectionHeading label="Constituency wire" title="Bellweather map" slug={`Year ${props.view.year}`} />
        {interaction !== null && <p className="map-instruction">{interaction.prompt}</p>}
        <LatestLobbyAction view={props.view} action={latestAction} />
        <PartyBoard view={props.view} interaction={interaction} />
        <PlayerScoring cardId={props.spectator ? null : props.ownSeat?.scoringCardId ?? null} />
        <DistrictMap
          view={props.view}
          interaction={interaction}
          supportChanges={supportChanges}
        />
        <PolicyDisplay view={props.view} scoringCardId={props.spectator ? null : props.ownSeat?.scoringCardId ?? null} />
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
            {props.seat.newYearBonusCardIds?.map((cardId) => (
              <b key={cardId}>{BONUS_CARDS_BY_ID[cardId].name}</b>
            ))}
          </div>
          {(props.seat.bonusCardIds?.length ?? 0) > 0 && (
            <div className="new-year-area">
              <span>Held Bonus cards</span>
              {props.seat.bonusCardIds!.map((cardId) => (
                <b key={cardId}>{BONUS_CARDS_BY_ID[cardId].name}</b>
              ))}
            </div>
          )}

        </>
      ) : (
        <p className="folio-public-copy">Hands, New Year cards, and promise priorities remain private until game end.</p>
      )}
    </aside>
  );
}

function PlayerScoring({ cardId }: { cardId: ScoringCardId | null }) {
  if (cardId === null) return null;
  return <section className="private-priorities" aria-label="Your secret priorities"><strong>Your secret priorities</strong><p>Every enacted policy: + value − value at game end.</p><ol>{SCORING_CARDS_BY_ID[cardId].order.map((category, index) => <li key={category}><b>{6-index}</b> {category}</li>)}</ol></section>;
}

function PolicyDisplay({ view, scoringCardId }: { view: GameView; scoringCardId: ScoringCardId | null }) {
  const projectedScore = (policyId: PolicyId) => scoringCardId === null ? null
    : scorePolicies(SCORING_CARDS_BY_ID[scoringCardId], [policyId], view.enactedPolicyIds)[0]!.net;
  return <section className="policy-display"><h3>Regional policies</h3><p>Each surviving Support votes. For must exceed Against; ties fail. Centre keeps all Support.</p>
    <div className="regional-policies">{REGION_IDS.map(regionId => {
      const policyId = view.pendingPolicies[regionId];
      return <section key={regionId}><h4>{REGION_NAMES[regionId]}</h4>{policyId ? <PolicyCard policyId={policyId} projectedScore={projectedScore(policyId)}/> : <p>Final vote complete</p>}</section>;
    })}</div>
    <details className="enacted-laws" open={view.enactedPolicyIds.length > 0}><summary>Enacted laws ({view.enactedPolicyIds.length})</summary><p>Global effects. Identical effects apply once per card; no loops.</p><div className="regional-policies">{view.enactedPolicyIds.map(id => <PolicyCard key={id} policyId={id} projectedScore={projectedScore(id)}/>)}</div></details>
    <details><summary>Failed policies ({view.discardedPolicyIds.length}) · {view.policyDeckCount} undealt</summary><ul>{view.discardedPolicyIds.map(id => <li key={id}>{POLICIES_BY_ID[id].name}</li>)}</ul></details>
  </section>;
}

function Metric(props: { label: string; value: number; accent?: boolean; dark?: boolean }) {
  return <div className={`folio-metric ${props.accent ? "folio-accent" : ""} ${props.dark ? "folio-dark" : ""}`}><span>{props.label}</span><strong>{props.value}</strong></div>;
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
        const open = state?.status === "open";
        const stateLabel = open ? `Open · ${owner?.displayName ?? "Unknown"}` : "Closed";
        const selectable = interaction?.partyIds?.includes(party.id) === true;
        const selected = interaction?.selectedPartyIds?.includes(party.id) === true;
        return (
          <article
            key={party.id}
            className={`party-file ${open ? "" : "party-file-closed"} ${targeting ? "table-target" : ""} ${selectable ? "table-selectable" : ""} ${selected ? "table-selected" : ""}`}
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
            <div className="party-file-title"><strong>{party.shortName}</strong><small>{stateLabel}</small></div>
            <div className="pile-count"><b>{pile}</b><span>pile</span></div>
            <div className="pile-cards" aria-label={`${pile} Operation cards`}>
              {state !== undefined && OPERATION_IDS.map((operation) => state.operations[operation] > 0 && <span key={operation}>{operation.slice(0, 3)} {state.operations[operation]}</span>)}
            </div>
            <ol className="party-priorities" aria-label={`${party.shortName} public priorities`}>{PARTY_PRIORITIES[party.id].map((category, index) => <li key={category}>{index+1}. {category}</li>)}</ol>
            <div className="bonus-flags">
              {party.bonusCards.map((card) => (
                <span
                  key={card.id}
                  className={view.bonusCardsAtParties[party.id].includes(card.id) ? "" : "bonus-used"}
                >
                  {card.name}
                </span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function LatestLobbyAction({
  view,
  action
}: {
  view: GameView;
  action: GameView["lobbyActions"][number] | null;
}) {
  if (action === null) {
    return (
      <aside className="latest-action" aria-label="Latest Lobby action">
        <p className="section-label">Latest action</p>
        <strong>No Lobby action yet this year</strong>
      </aside>
    );
  }
  const actor = view.seats.find((seat) => seat.id === action.seatId)?.displayName ?? "Unknown player";
  const party = action.partyId === null ? null : PARTIES_BY_ID[action.partyId];
  const bonusCard = action.bonusCardId === null ? null : BONUS_CARDS_BY_ID[action.bonusCardId];
  const cards = action.type === "operate"
    ? view.resolvedOperations.filter(
        (record) =>
          record.year === action.year &&
          record.turn === action.turn &&
          record.seatId === action.seatId
      )
    : [];
  const actionCopy = action.type === "operate"
    ? `operated ${party?.name ?? "an unknown party"}`
    : action.type === "collect"
      ? `collected ${party?.name ?? "an unknown party"}`
      : action.type === "close"
        ? `closed ${party?.name ?? "an unknown party"}`
        : "passed";
  return (
    <aside className="latest-action" aria-label="Latest Lobby action">
      <div>
        <p className="section-label">Latest action</p>
        <strong>{actor} {actionCopy}</strong>
      </div>
      {cards.length > 0 && (
        <ol className="latest-action-cards" aria-label="Cards resolved">
          {cards.map((record, index) => (
            <li key={`${record.turn}-${index}`}>
              {record.bonusCardId === null
                ? titleCase(record.operation ?? "operation")
                : BONUS_CARDS_BY_ID[record.bonusCardId].name}
            </li>
          ))}
        </ol>
      )}
      {(action.type === "collect" || action.type === "close") && (
        <div className="latest-action-bonus">
          {bonusCard === null ? (
            <span>No Bonus card</span>
          ) : (
            <>
              <PartyEmblem partyId={bonusCard.homePartyId} />
              <span>Bonus · {bonusCard.name}</span>
            </>
          )}
        </div>
      )}
      {action.supportChanges.length > 0 && (
        <ul className="latest-action-changes" aria-label="Support changes">
          {action.supportChanges.map((change, index) => (
            <li key={`${supportChangeKey(change)}-${index}`}>{supportChangeLabel(change)}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function DistrictMap({
  view,
  interaction = null,
  supportChanges = []
}: {
  view: GameView;
  interaction?: TableInteraction | null;
  supportChanges?: SupportChange[];
}) {
  const targeting = interaction?.onDistrictClick !== undefined;
  return (
    <div className="district-map-scroll"><div className="district-map" aria-label="Bellweather district map">
      <svg className="district-terrain" viewBox="40 105 1108 583" aria-hidden="true">
        <rect x="40" y="105" width="1108" height="583" fill="#d9edf5" />
        {MAP_BRIDGES.map((bridge) => <g key={bridge.districtIds.join("-")} data-bridge={bridge.districtIds.join(":")}>
          <path d={`M ${bridge.points[0].join(",")} L ${bridge.points[1].join(",")}`} stroke="#19354b" strokeWidth="14" />
          <path d={`M ${bridge.points[0].join(",")} L ${bridge.points[1].join(",")}`} stroke="#fff5d8" strokeWidth="9" />
        </g>)}
        {DISTRICTS.map((district) => <polygon key={district.id}
          points={district.polygon.map((p) => p.join(",")).join(" ")}
          fill={district.regionId === "urban" ? "#e6b6a6" : district.regionId === "mixed" ? "#dbeaca" : district.regionId === "outlying" ? "#f5e7ac" : "#e4dfea"}
          stroke={interaction?.selectedDistrictIds?.includes(district.id) ? "#bd542f" : "#19354b"}
          strokeWidth={interaction?.selectedDistrictIds?.includes(district.id) ? 5 : 2}
          className={interaction?.districtIds?.includes(district.id) ? "terrain-selectable" : ""}
          onClick={() => { if (interaction?.districtIds?.includes(district.id)) interaction.onDistrictClick?.(district.id); }}
        />)}
        <g className="lake-labels"><text x="599" y="239">Upper Mere</text><text x="449" y="376">Willow Lake</text><text x="789" y="416">Longmere</text></g>
      </svg>
      {DISTRICTS.map((district) => {
        const support = view.support[district.id] ?? {};
        const occupied = PARTIES.reduce((total, party) => total + (support[party.id] ?? 0), 0);
        const selectable = interaction?.districtIds?.includes(district.id) === true;
        const selected = interaction?.selectedDistrictIds?.includes(district.id) === true;
        const summary = `${district.name}: ${occupied} of ${district.capacity} Support spaces occupied`;
        return (
          <article
            key={district.id}
            data-district-id={district.id}
            style={{ left: `${(district.label[0] - 40) / 1108 * 100}%`, top: `${(district.label[1] - 130) / 583 * 100}%` }}
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
              ><strong>{district.id === "bellweather-centre" ? "Bellweather" : district.name}</strong><small>{REGION_NAMES[district.regionId]} · {occupied}/{district.capacity}</small></button>
            ) : (
              <div className="district-heading"><strong>{district.id === "bellweather-centre" ? "Bellweather" : district.name}</strong><small>{REGION_NAMES[district.regionId]} · {occupied}/{district.capacity}</small></div>
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
      <MapChangeLayer supportChanges={supportChanges} />
    </div></div>
  );
}

interface MapPoint {
  x: number;
  y: number;
}

interface MapGeometry {
  width: number;
  height: number;
  points: Partial<Record<DistrictId, MapPoint>>;
}

function MapChangeLayer({
  supportChanges
}: {
  supportChanges: SupportChange[];
}) {
  const layerRef = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<MapGeometry>({
    width: 0,
    height: 0,
    points: {}
  });
  useLayoutEffect(() => {
    const map = layerRef.current?.parentElement;
    if (map === undefined || map === null) return;
    const measure = () => {
      const mapRect = map.getBoundingClientRect();
      const points = Object.fromEntries(
        DISTRICTS.flatMap((district) => {
          const element = map.querySelector<HTMLElement>(`[data-district-id="${district.id}"]`);
          if (element === null) return [];
          const rect = element.getBoundingClientRect();
          return [[district.id, {
            x: rect.left - mapRect.left + map.scrollLeft + rect.width / 2,
            y: rect.top - mapRect.top + map.scrollTop + rect.height / 2
          }]];
        })
      ) as Partial<Record<DistrictId, MapPoint>>;
      setGeometry({
        width: map.scrollWidth,
        height: map.scrollHeight,
        points
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measure);
    observer?.observe(map);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [supportChanges]);

  const totals = new Map<string, number>();
  for (const change of supportChanges) {
    const key = supportChangeLayoutKey(change);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const occurrences = new Map<string, number>();

  return (
    <>
      <svg
        ref={layerRef}
        className="map-change-layer"
        width={geometry.width}
        height={geometry.height}
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        aria-hidden="true"
      >
        <defs>
          {PARTIES.map((party) => (
            <marker
              key={party.id}
              id={`map-arrow-${party.id}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8 Z" fill={party.color} />
            </marker>
          ))}
        </defs>
        {supportChanges.map((change, index) => {
          const changeKey = supportChangeKey(change);
          const layoutKey = supportChangeLayoutKey(change);
          const occurrence = occurrences.get(layoutKey) ?? 0;
          occurrences.set(layoutKey, occurrence + 1);
          const total = totals.get(layoutKey) ?? 1;
          const offset = (occurrence - (total - 1) / 2) * 16;
          const party = PARTIES_BY_ID[change.partyId];
          if (change.type === "move") {
            const source = geometry.points[change.sourceDistrictId];
            const destination = geometry.points[change.destinationDistrictId];
            if (source === undefined || destination === undefined) {
              return <g key={`${changeKey}-${index}`} data-map-change="move" />;
            }
            const dx = destination.x - source.x;
            const dy = destination.y - source.y;
            const distance = Math.hypot(dx, dy) || 1;
            const normalX = -dy / distance;
            const normalY = dx / distance;
            const insetX = dx / distance * 16;
            const insetY = dy / distance * 16;
            return (
              <g
                key={`${changeKey}-${index}`}
                data-map-change="move"
              >
                <line
                  x1={source.x + insetX + normalX * offset}
                  y1={source.y + insetY + normalY * offset}
                  x2={destination.x - insetX + normalX * offset}
                  y2={destination.y - insetY + normalY * offset}
                  stroke={party.color}
                  markerEnd={`url(#map-arrow-${party.id})`}
                />
              </g>
            );
          }
          const districtId = change.type === "add"
            ? change.destinationDistrictId
            : change.sourceDistrictId;
          const point = geometry.points[districtId];
          if (point === undefined) {
            return <g key={`${changeKey}-${index}`} data-map-change={change.type} />;
          }
          const yDirection = change.type === "add" ? 1 : -1;
          return (
            <g
              key={`${changeKey}-${index}`}
              data-map-change={change.type}
              transform={`translate(${point.x + offset} ${point.y})`}
              stroke={party.color}
            >
              <circle r="10" />
              <path d={`M0 ${-7 * yDirection} V${6 * yDirection} M-4 ${2 * yDirection} L0 ${6 * yDirection} L4 ${2 * yDirection}`} />
            </g>
          );
        })}
      </svg>
      {supportChanges.length > 0 && (
        <ul className="sr-only" aria-label="Latest map changes">
          {supportChanges.map((change, index) => (
            <li key={`${supportChangeKey(change)}-${index}`}>{supportChangeLabel(change)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function supportChangeKey(change: SupportChange): string {
  return change.type === "move"
    ? `${change.type}-${change.partyId}-${change.sourceDistrictId}-${change.destinationDistrictId}`
    : change.type === "add"
      ? `${change.type}-${change.partyId}-${change.destinationDistrictId}`
      : `${change.type}-${change.partyId}-${change.sourceDistrictId}`;
}

function supportChangeLayoutKey(change: SupportChange): string {
  return change.type === "move"
    ? `move-${change.sourceDistrictId}-${change.destinationDistrictId}`
    : `district-${change.type === "add" ? change.destinationDistrictId : change.sourceDistrictId}`;
}

function supportChangeLabel(change: SupportChange): string {
  const party = PARTIES_BY_ID[change.partyId].shortName;
  if (change.type === "move") {
    return `${party} moved from ${DISTRICTS_BY_ID[change.sourceDistrictId].name} to ${DISTRICTS_BY_ID[change.destinationDistrictId].name}`;
  }
  if (change.type === "add") {
    return `${party} added to ${DISTRICTS_BY_ID[change.destinationDistrictId].name}`;
  }
  return `${party} removed from ${DISTRICTS_BY_ID[change.sourceDistrictId].name}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  if (props.view.phase === "closure") {
    return <ClosureDesk {...props} />;
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

function ClosureDesk(props: {
  view: GameView;
  seatId: string;
  busy: boolean;
  onCommand(command: GameCommand): Promise<boolean | void>;
}) {
  const phase = props.view.phaseData;
  if (phase.type !== "closure") return <WaitingCopy view={props.view} />;
  const partyId = phase.pendingPartyIds[0];
  if (partyId === undefined) return <WaitingCopy view={props.view} />;
  const party = props.view.parties[partyId];
  if (party?.ownerSeatId !== props.seatId) return <WaitingCopy view={props.view} />;
  const available = props.view.bonusCardsAtParties[partyId];
  return (
    <BonusCardChoice
      title={`${PARTIES_BY_ID[partyId].shortName} Closure`}
      copy="Choose one available Bonus card before Cleanup releases every New Year area."
      bonusCardIds={available}
      busy={props.busy}
      button="Confirm Closure choice"
      onSubmit={(bonusCardId) => props.onCommand({
        type: "game_action",
        action: {
          type: "choose_closure_bonus",
          partyId,
          ...(bonusCardId === undefined ? {} : { bonusCardId })
        }
      })}
    />
  );
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
    : openPartyIds;
  const closeTargetPartyIds = firstTurn
    ? []
    : openPartyIds.filter((candidate) => props.view.parties[candidate]?.ownerSeatId === props.seatId);
  const collectLegal = party !== undefined && props.seat.collectionCounters > 0;
  const closeLegal = party !== undefined && party.ownerSeatId === props.seatId && !firstTurn;
  const passLegal = !openPartyIds.some(
    (candidate) => props.view.parties[candidate]?.ownerSeatId === props.seatId
  );
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
        <SimplePartyAction title="Collect" copy="Spend one Collection counter and take the complete public pile, even when empty, into your New Year area. You must also take one Bonus card if available. The party stays open." partyId={partyId} onPartyId={setPartyId} partyIds={openPartyIds} targetPartyIds={collectTargetPartyIds} bonusCardIds={props.view.bonusCardsAtParties[partyId]} disabled={props.busy || !collectLegal} button={`Collect ${party === undefined ? 0 : operationCount(party.operations)} cards`} onInteraction={props.onInteraction} onSubmit={(bonusCardId) => props.onCommand({ type: "game_action", action: { type: "collect", partyId, ...(bonusCardId === undefined ? {} : { bonusCardId }) } })} />
      )}
      {mode === "close" && (
        <SimplePartyAction title="Close" copy={firstTurn ? "You cannot Close on your first Lobby turn." : "Only the opening Firm may Close. Its owner takes the pile, takes one Bonus card if available, and gets the opening back."} partyId={partyId} onPartyId={setPartyId} partyIds={openPartyIds} targetPartyIds={closeTargetPartyIds} bonusCardIds={props.view.bonusCardsAtParties[partyId]} disabled={props.busy || !closeLegal} button="Close party" onInteraction={props.onInteraction} onSubmit={(bonusCardId) => props.onCommand({ type: "game_action", action: { type: "close", partyId, ...(bonusCardId === undefined ? {} : { bonusCardId }) } })} />
      )}
      {mode === "pass" && (
        <PassAction busy={props.busy} eligible={passLegal} onInteraction={props.onInteraction} onPass={() => props.onCommand({ type: "game_action", action: { type: "pass" } })} />
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
  bonusCardIds: BonusCardId[];
  disabled: boolean;
  button: string;
  onSubmit(bonusCardId?: BonusCardId): Promise<boolean | void>;
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
}) {
  const targetPartyKey = props.targetPartyIds.join(",");
  const [bonusCardId, setBonusCardId] = useState<BonusCardId | "">("");
  useEffect(() => setBonusCardId(""), [props.partyId]);
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
  const selectionValid = props.bonusCardIds.length === 0 || props.bonusCardIds.includes(bonusCardId as BonusCardId);
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (selectionValid && !props.disabled) void props.onSubmit(props.bonusCardIds.length > 0 ? bonusCardId as BonusCardId : undefined);
    }}>
      <div className="action-copy"><h3>{props.title}</h3><p>{props.copy}</p></div>
      <PartySelect partyId={props.partyId} partyIds={props.partyIds} onPartyId={props.onPartyId} />
      {props.bonusCardIds.length > 0 && (
        <label>
          Bonus card
          <select required aria-label="Bonus card" value={bonusCardId} onChange={(event) => setBonusCardId(event.target.value as BonusCardId | "")}>
            <option value="" disabled>Choose a Bonus card</option>
            {props.bonusCardIds.map((cardId) => <option key={cardId} value={cardId}>{BONUS_CARDS_BY_ID[cardId].name}</option>)}
          </select>
        </label>
      )}
      <button className="red-button" disabled={props.disabled || !selectionValid}>{props.button}</button>
    </form>
  );
}

function BonusCardChoice(props: {
  title?: string;
  copy?: string;
  bonusCardIds: BonusCardId[];
  busy: boolean;
  button: string;
  onSubmit(bonusCardId?: BonusCardId): Promise<boolean | void>;
}) {
  const [bonusCardId, setBonusCardId] = useState<BonusCardId | "">("");
  useEffect(() => {
    if (bonusCardId !== "" && !props.bonusCardIds.includes(bonusCardId)) {
      setBonusCardId("");
    }
  }, [bonusCardId, props.bonusCardIds]);
  const selectionValid = props.bonusCardIds.length === 0 || props.bonusCardIds.includes(bonusCardId as BonusCardId);
  return (
    <div className="action-copy">
      {props.title !== undefined && <h3>{props.title}</h3>}
      {props.copy !== undefined && <p>{props.copy}</p>}
      {props.bonusCardIds.length > 0 && (
        <label>
          Bonus card
          <select required aria-label="Bonus card" value={bonusCardId} onChange={(event) => setBonusCardId(event.target.value as BonusCardId | "")}>
            <option value="" disabled>Choose a Bonus card</option>
            {props.bonusCardIds.map((cardId) => <option key={cardId} value={cardId}>{BONUS_CARDS_BY_ID[cardId].name}</option>)}
          </select>
        </label>
      )}
      <button className="red-button" disabled={props.busy || !selectionValid} onClick={() => { if (selectionValid && !props.busy) void props.onSubmit(props.bonusCardIds.length > 0 ? bonusCardId as BonusCardId : undefined); }}>{props.button}</button>
    </div>
  );
}

function PassAction(props: {
  busy: boolean;
  eligible: boolean;
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
  onPass(): Promise<boolean | void>;
}) {
  useEffect(() => {
    props.onInteraction?.(null);
  }, [props.onInteraction]);
  return (
    <div className="action-copy">
      <h3>Pass</h3>
      <p>{props.eligible ? "All your Firm markers have returned. Take no action this turn." : "Return all your Firm markers before passing."}</p>
      <button className="red-button" disabled={props.busy || !props.eligible} onClick={() => void props.onPass()}>Pass this turn</button>
    </div>
  );
}

export function OperationComposer(props: {
  view: GameView;
  seat: ViewSeat;
  partyId: PartyId;
  onPartyId(partyId: PartyId): void;
  busy: boolean;
  onSubmit(play: OperationPlay): Promise<boolean | void>;
  onFinish(): Promise<boolean | void>;
  onInteraction?: ((interaction: TableInteraction | null) => void) | undefined;
}) {
  const nextId = useRef(1);
  const operationChoicesRef = useRef<HTMLDivElement>(null);
  const sequence = props.view.phaseData.type === "lobby"
    ? props.view.phaseData.inProgressOperate
    : null;
  const resolvedCount = sequence?.cardCount ?? 0;
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
    () => previewDraft(
      props.view,
      operationState,
      props.seat,
      props.partyId,
      draft
    ),
    [props.view, operationState, props.seat, props.partyId, draft]
  );
  const openPartyIds = PARTIES.map((party) => party.id).filter((partyId) => props.view.parties[partyId]?.status === "open");
  const playableBonusCardIds = (props.seat.bonusCardIds ?? []).filter(() =>
    props.view.parties[props.partyId]?.status === "open"
  );
  const partyLocked = sequence !== null;
  const chooseOperation = (operation: OperationId) => {
    setDraft(emptyOperationDraft(nextId.current++, operation, props.partyId));
    setArmedTarget(defaultOperationTarget(operation));
  };
  const chooseBonusCard = (bonusCardId: BonusCardId) => {
    const operation = BONUS_CARDS_BY_ID[bonusCardId].operation;
    if (operation === null) {
      setDraft({
        ...emptyOperationDraft(nextId.current++, draft.operation, props.partyId),
        bonusCardId
      });
      return;
    }
    setDraft({
      ...emptyOperationDraft(nextId.current++, operation, props.partyId),
      bonusCardId
    });
    setArmedTarget(defaultOperationTarget(operation));
  };
  const chooseActingParty = (partyId: PartyId) => {
    props.onPartyId(partyId);
    setArmedTarget(defaultOperationTarget(draft.operation));
    operationChoicesRef.current?.focus();
  };
  const update = (patch: Partial<OperationDraft>) => {
    setDraft((current) => ({ ...current, ...patch, ...(patch.followUpOrder === undefined ? {followUpOrder: null} : {}) }));
    if (draft.operation === "organise" && patch.sourceDistrictId) {
      setArmedTarget("destinationDistrictId");
    }
  };
  const interactionKey = JSON.stringify([
    armedTarget,
    draft,
    props.partyId,
    partyLocked,
    props.busy,
    openPartyIds,
    props.view.support,
    props.view.enactedPolicyIds
  ]);
  useEffect(() => {
    if (props.onInteraction === undefined) return;
    const actingPartyInteraction = {
      partyIds: partyLocked || props.busy ? [] : openPartyIds,
      selectedPartyIds: [props.partyId],
      onPartyClick: partyLocked || props.busy ? undefined : chooseActingParty
    };
    if (
      draft.bonusCardId !== "" &&
      BONUS_CARDS_BY_ID[draft.bonusCardId].operation === null
    ) {
      props.onInteraction({ prompt: partyLocked ? "Continue at the acting party." : "Select an open party or complete this Bonus card.", ...actingPartyInteraction });
      return () => props.onInteraction?.(null);
    }
    const interaction = operationTableInteraction({
      state: operationState,
      partyId: props.partyId,
      openPartyIds,
      partyLocked,
      draft,
      armedTarget,
      onPartyId: chooseActingParty,
      onDraft: update
    });
    props.onInteraction({
      ...actingPartyInteraction,
      ...interaction
    });
    return () => props.onInteraction?.(null);
  }, [interactionKey, props.onInteraction]);

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      if (preview.play !== null) void props.onSubmit(preview.play);
    }}>
      <p className="action-lede">Resolve one ordinary Operation or held Bonus card now. Then either resolve another card at this party or finish your action.</p>
      <p className="operation-progress">Card {resolvedCount + 1} of up to 3</p>
      <PartySelect partyId={props.partyId} partyIds={openPartyIds} onPartyId={props.onPartyId} disabled={partyLocked} active={armedTarget === "actingParty"} onArm={() => setArmedTarget("actingParty")} />
      <div ref={operationChoicesRef} tabIndex={-1} className="operation-adders" aria-label="Choose an Operation card">
        {OPERATION_IDS.map((operation) => (
          <button type="button" key={operation} className={draft.bonusCardId === "" && draft.operation === operation ? "active" : ""} disabled={(props.seat.operations?.[operation] ?? 0) < 1} onClick={() => chooseOperation(operation)}>
            {operation} <b>{props.seat.operations?.[operation] ?? 0}</b>
          </button>
        ))}
        {playableBonusCardIds.map((cardId) => (
          <button type="button" key={cardId} className={draft.bonusCardId === cardId ? "active" : ""} onClick={() => chooseBonusCard(cardId)}>
            {BONUS_CARDS_BY_ID[cardId].name} <b>Bonus</b>
          </button>
        ))}
      </div>
      <OperationDraftCard
        index={resolvedCount}
        draft={draft}
        view={props.view}
        seat={props.seat}
        partyId={props.partyId}
        armedTarget={armedTarget}
        onArm={setArmedTarget}
        onUpdate={update}
      />
      {preview.message !== null && <p className="validation-copy">{preview.message}</p>}
      <div className="button-row">
        <button className="red-button" disabled={props.busy || preview.play === null}>Resolve {draft.bonusCardId === "" ? draft.operation : BONUS_CARDS_BY_ID[draft.bonusCardId].name}</button>
        {sequence !== null && <button type="button" className="ink-button" disabled={props.busy} onClick={() => void props.onFinish()}>Finish Operate</button>}
      </div>
    </form>
  );
}

function OperationDraftCard(props: {
  index: number;
  draft: OperationDraft;
  view: GameView;
  seat: ViewSeat;
  partyId: PartyId;
  armedTarget: OperationTarget;
  onArm(target: OperationTarget): void;
  onUpdate(patch: Partial<OperationDraft>): void;
}) {
  const bonus = props.draft.bonusCardId === ""
    ? null
    : BONUS_CARDS_BY_ID[props.draft.bonusCardId];
  if (bonus?.operation === null) {
    return (
      <UnboundDraftCard
        index={props.index}
        cardId={bonus.id}
        draft={props.draft.unbound}
        view={props.view}
        seat={props.seat}
        partyId={props.partyId}
        onUpdate={(patch) => props.onUpdate({
          unbound: { ...props.draft.unbound, ...patch }
        })}
      />
    );
  }
  return (
    <fieldset className="operation-card">
      <legend>{props.index + 1}. {props.draft.operation}</legend>
      {props.draft.operation === "organise" && (
        <><div className="field-grid"><DistrictSelect label="Source" optional value={props.draft.sourceDistrictId} active={props.armedTarget === "sourceDistrictId"} onArm={() => props.onArm("sourceDistrictId")} onChange={(sourceDistrictId) => props.onUpdate({ sourceDistrictId })} /><DistrictSelect label="Destination" value={props.draft.destinationDistrictId} active={props.armedTarget === "destinationDistrictId"} onArm={() => props.onArm("destinationDistrictId")} onChange={(destinationDistrictId) => props.onUpdate({ destinationDistrictId })} /></div>
        {(props.draft.bonusCardId === "riverworks-canal-network" || activeLawEffects(props.view.enactedPolicyIds).includes(7)) && <label>Support to move<input type="number" min={1} max={props.draft.bonusCardId === "riverworks-canal-network" ? 54 : 2} step={1} value={props.draft.count} onChange={(event) => props.onUpdate({ count: Number(event.target.value) })} /></label>}</>
      )}
      {props.draft.operation === "rally" && <DistrictSelect label="Rally district" value={props.draft.districtId} active={props.armedTarget === "districtId"} onArm={() => props.onArm("districtId")} onChange={(districtId) => props.onUpdate({ districtId })} />}
      {props.draft.operation === "smear" && <div className="field-grid"><DistrictSelect label="District" value={props.draft.districtId} active={props.armedTarget === "districtId"} onArm={() => props.onArm("districtId")} onChange={(districtId) => props.onUpdate({ districtId })} /><PartyField label="Rival party" value={props.draft.rivalParty} actingParty={props.partyId} active={props.armedTarget === "rivalParty"} onArm={() => props.onArm("rivalParty")} onChange={(rivalParty) => { if (rivalParty !== "") props.onUpdate({ rivalParty }); }} /></div>}
      {bonus !== null && <p className="bonus-check"><span><b>{bonus.name}</b>{bonus.effect}</span></p>}
      <LawFields draft={props.draft} view={props.view} partyId={props.partyId} onUpdate={props.onUpdate} />
      {bonus !== null && <BonusFields draft={props.draft} homePartyId={bonus.homePartyId} actingPartyId={props.partyId} armedTarget={props.armedTarget} onArm={props.onArm} onUpdate={props.onUpdate} />}
    </fieldset>
  );
}

function UnboundDraftCard(props: {
  index: number; cardId: BonusCardId; draft: UnboundDraft; view: GameView; seat: ViewSeat; partyId: PartyId;
  onUpdate(patch: Partial<UnboundDraft>): void;
}) {
  const {draft, onUpdate, cardId, view} = props;
  const card = BONUS_CARDS_BY_ID[cardId];
  const policyId = view.pendingPolicies[draft.regionId];
  const sideParties = policyId ? PARTIES.filter(p => votesFor(p.id, POLICIES_BY_ID[policyId]) === draft.forPolicy).map(p => p.id) : [];
  const policyFields = <div className="field-grid"><label>Policy region<select value={draft.regionId} onChange={e=>onUpdate({regionId:e.target.value as RegionId,policyDistrictIds:{}})}>{REGION_IDS.map(id=><option key={id} value={id}>{REGION_NAMES[id]}</option>)}</select></label><label>Voting side<select value={String(draft.forPolicy)} onChange={e=>onUpdate({forPolicy:e.target.value==='true',policyDistrictIds:{}})}><option value="true">For</option><option value="false">Against</option></select></label></div>;
  return <fieldset className="operation-card"><legend>{props.index+1}. {card.name}</legend><p>{card.effect}</p>
    {cardId === 'honeycomb-common-cause' && <><DistrictSelect label="Shared district" value={draft.districtId} onChange={districtId=>onUpdate({districtId})}/><PartyChoiceSelect label="Partner party" value={draft.partnerPartyId} partyIds={PARTIES.filter(p=>p.id!=='honeycomb').map(p=>p.id)} onChange={partnerPartyId=>onUpdate({partnerPartyId})}/></>}
    {cardId === 'foxglove-whisper-network' && <><DistrictSelect label="Rival source" value={draft.sourceDistrictId} onChange={sourceDistrictId=>onUpdate({sourceDistrictId})}/><PartyChoiceSelect label="Rival to move" value={draft.partnerPartyId} partyIds={PARTIES.filter(p=>p.id!==props.partyId).map(p=>p.id)} onChange={partnerPartyId=>onUpdate({partnerPartyId})}/><DistrictSelect label="Rival destination" value={draft.destinationDistrictId} onChange={destinationDistrictId=>onUpdate({destinationDistrictId})}/></>}
    {cardId === 'old-shell-institutional-memory' && <>{policyFields}{sideParties.map(partyId=><DistrictSelect key={partyId} regionId={draft.regionId} label={`${PARTIES_BY_ID[partyId].shortName} destination`} optional emptyLabel="Skip only if region runs out of room" value={draft.policyDistrictIds[partyId]??''} onChange={id=>onUpdate({policyDistrictIds:{...draft.policyDistrictIds,[partyId]:id}})}/>)}</>}
    {cardId === 'many-wings-joint-campaign' && <>{policyFields}<DistrictSelect label="Campaign destination" regionId={draft.regionId} value={draft.destinationDistrictId} onChange={destinationDistrictId=>onUpdate({destinationDistrictId})}/>{draft.campaignMoves.map((move,i)=><div className="field-grid" key={i}><DistrictSelect label={`Support ${i+1} source`} value={move.sourceDistrictId} onChange={id=>onUpdate({campaignMoves:draft.campaignMoves.map((m,j)=>i===j?{...m,sourceDistrictId:id}:m)})}/><PartyChoiceSelect label={`Support ${i+1} party`} value={move.partyId} partyIds={sideParties} onChange={id=>onUpdate({campaignMoves:draft.campaignMoves.map((m,j)=>i===j?{...m,partyId:id}:m)})}/></div>)}<button type="button" disabled={draft.campaignMoves.length>=3} onClick={()=>onUpdate({campaignMoves:[...draft.campaignMoves,{sourceDistrictId:'',partyId:''}]})}>Add Support</button><button type="button" disabled={draft.campaignMoves.length<=1} onClick={()=>onUpdate({campaignMoves:draft.campaignMoves.slice(0,-1)})}>Remove Support</button></>}
    {cardId === 'foxglove-shell-firm' && <PartyChoiceSelect label="Destination party" value={draft.targetPartyId} partyIds={PARTIES.filter(p=>p.id!==props.partyId&&view.parties[p.id]?.status!=='open').map(p=>p.id)} onChange={targetPartyId=>onUpdate({targetPartyId})}/>}
    {cardId === 'riverworks-mass-transit' && <>{draft.transitDistrictIds.map((id,i)=><div className="field-grid" key={i}><DistrictSelect label={`District ${i+1}${i===draft.transitDistrictIds.length-1?' · free endpoint':''}`} value={id} onChange={id=>onUpdate({transitDistrictIds:draft.transitDistrictIds.map((d,j)=>i===j?id:d)})}/>{i<draft.transitDistrictIds.length-1&&<PartyChoiceSelect label="Support moved onward" value={draft.transitSupportPartyIds[i]??''} partyIds={PARTIES.map(p=>p.id)} onChange={id=>onUpdate({transitSupportPartyIds:draft.transitSupportPartyIds.map((p,j)=>i===j?id:p)})}/>}</div>)}<button type="button" disabled={draft.transitDistrictIds.length>=5} onClick={()=>onUpdate({transitDistrictIds:[...draft.transitDistrictIds,''],transitSupportPartyIds:[...draft.transitSupportPartyIds,'']})}>Add district</button><button type="button" disabled={draft.transitDistrictIds.length<=2} onClick={()=>onUpdate({transitDistrictIds:draft.transitDistrictIds.slice(0,-1),transitSupportPartyIds:draft.transitSupportPartyIds.slice(0,-1)})}>Remove district</button></>}
    {cardId === 'many-wings-empty-every-nest' && <><MultiDistrictSelect label="Source districts" value={draft.sourceDistrictIds} onChange={sourceDistrictIds=>onUpdate({sourceDistrictIds})}/><MultiDistrictSelect label="Different destination districts" value={draft.destinationDistrictIds} onChange={destinationDistrictIds=>onUpdate({destinationDistrictIds})}/></>}
    {cardId === 'night-parliament-midnight-session' && <><PartyChoiceSelect label="Closed party" value={draft.targetPartyId} partyIds={PARTIES.filter(p=>view.parties[p.id]?.status==='closed').map(p=>p.id)} onChange={targetPartyId=>onUpdate({targetPartyId})}/><FirmChoiceSelect value={draft.firmId} firmIds={props.seat.firmIds.filter(id=>!Object.values(view.parties).some(p=>p?.status==='open'&&p.firmId===id)) as FirmId[]} onChange={firmId=>onUpdate({firmId})}/></>}
  </fieldset>;
}

function LawFields({draft,view,partyId,onUpdate}:{draft:OperationDraft;view:GameView;partyId:PartyId;onUpdate(patch:Partial<OperationDraft>):void}) {
  const laws=activeLawEffects(view.enactedPolicyIds);
  const choice=draftChoice({...draft,followUpOrder:null});
  const extras=choice?operationFollowUps(toOperationState(view),{party:partyId,choice,...(draft.bonusCardId?{bonusCardId:draft.bonusCardId}:{})}):[];
  const order=draft.followUpOrder??extras;
  const standalone=draft.bonusCardId==='riverworks-canal-network';
  if(standalone)return null;
  return <div className="law-fields">
    {draft.operation==='rally'&&(laws.includes(1)||laws.includes(22))&&<DistrictSelect label="Rally source (for extended placement)" optional value={draft.sourceDistrictId} onChange={sourceDistrictId=>onUpdate({sourceDistrictId})}/>}
    {draft.operation==='organise'&&laws.includes(10)&&Array.from({length:Math.min(2,Math.max(0,draft.count))},(_,i)=><PartyChoiceSelect key={i} label={`Arrival ${i+1}: swap rival (optional)`} value={draft.swapPartyIds[i]??''} partyIds={PARTIES.filter(p=>p.id!==partyId).map(p=>p.id)} onChange={id=>{const swaps=[...draft.swapPartyIds];if(id==='')swaps.splice(i,1);else swaps[i]=id;onUpdate({swapPartyIds:swaps.filter(Boolean)});}}/>)}
    {draft.operation==='smear'&&laws.includes(14)&&<DistrictSelect label="Displacement destination (optional)" optional emptyLabel="Remove Support normally" value={draft.displacementDistrictId} onChange={displacementDistrictId=>onUpdate({displacementDistrictId})}/>}
    {extras.includes(6)&&<DistrictSelect label="Fresh Start: second placement" value={draft.freshStartDistrictId} optional onChange={freshStartDistrictId=>onUpdate({freshStartDistrictId})}/>}
    {extras.includes(28)&&<DistrictSelect label="Chain Migration: different Support source" value={draft.chainSourceDistrictId} optional onChange={chainSourceDistrictId=>onUpdate({chainSourceDistrictId})}/>}
    {extras.length>1&&<><p>Resolve extras in this order. Law extras are mandatory when possible and otherwise skipped. Bonus extras follow their card text: required extras must succeed; Dig In skips a full source and Midnight Leak skips if no matching rival is available.</p><ol className="follow-up-order">{order.map((id,i)=><li key={id}><span>{id==='bonus'?'Bonus extra':LAW_EFFECTS.find(e=>e.id===id)!.name}</span><button type="button" aria-label={`Move ${id==='bonus'?'Bonus extra':LAW_EFFECTS.find(e=>e.id===id)!.name} earlier`} disabled={i===0} onClick={()=>{const next=[...order];[next[i-1],next[i]]=[next[i]!,next[i-1]!];onUpdate({followUpOrder:next});}}>↑</button></li>)}</ol></>}
  </div>;
}

function BonusFields(props: { draft: OperationDraft; homePartyId: PartyId; actingPartyId: PartyId; armedTarget: OperationTarget; onArm(target: OperationTarget): void; onUpdate(patch: Partial<OperationDraft>): void }) {
  const { draft, homePartyId } = props;
  const scatterId = useId();
  if (homePartyId === "riverworks" && draft.operation === "rally") {
    return <DistrictSelect label="Public Works district" value={draft.bonusDistrictId} active={props.armedTarget === "bonusDistrictId"} onArm={() => props.onArm("bonusDistrictId")} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} />;
  }
  if (homePartyId === "many-wings" && draft.operation === "rally") {
    return <div className={`target-field ${props.armedTarget === "bonusDistrictIds" ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={scatterId}>Scatter destinations</label><button type="button" className="target-arm" onClick={() => props.onArm("bonusDistrictIds")}>Select on map</button></div><select id={scatterId} multiple value={draft.bonusDistrictIds} onFocus={() => props.onArm("bonusDistrictIds")} onChange={(event) => props.onUpdate({ bonusDistrictIds: [...event.currentTarget.selectedOptions].map((option) => option.value) })}>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div>;
  }
  if (homePartyId === "night-parliament" && draft.operation === "rally") {
    return <DistrictSelect label="Quiet Hours district" value={draft.bonusDistrictId} active={props.armedTarget === "bonusDistrictId"} onArm={() => props.onArm("bonusDistrictId")} onChange={(bonusDistrictId) => props.onUpdate({ bonusDistrictId })} />;
  }
  if (homePartyId === "night-parliament" && draft.operation === "smear") {
    return <DistrictSelect label="Midnight Leak district" optional value={draft.bonusDistrictId} onChange={(bonusDistrictId) => props.onUpdate({bonusDistrictId})} />;
  }
  return null;
}

function PartyChoiceSelect(props: {
  label: string;
  value: PartyId | "";
  partyIds: PartyId[];
  onChange(value: PartyId | ""): void;
}) {
  const id = useId();
  return <label htmlFor={id}>{props.label}<select id={id} value={props.value} onChange={(event) => props.onChange(event.target.value as PartyId | "")}><option value="">Choose party</option>{props.partyIds.map((partyId) => <option key={partyId} value={partyId}>{PARTIES_BY_ID[partyId].name}</option>)}</select></label>;
}

function FirmChoiceSelect(props: {
  value: FirmId | "";
  firmIds: FirmId[];
  onChange(value: FirmId | ""): void;
}) {
  const id = useId();
  return <label htmlFor={id}>Returned Firm marker<select id={id} value={props.value} onChange={(event) => props.onChange(event.target.value as FirmId | "")}><option value="">Choose Firm</option>{props.firmIds.map((firmId) => <option key={firmId} value={firmId}>{FIRMS_BY_ID[firmId].name}</option>)}</select></label>;
}

function MultiDistrictSelect(props: {
  label: string;
  value: string[];
  onChange(value: string[]): void;
}) {
  const id = useId();
  return <label htmlFor={id}>{props.label}<select id={id} multiple value={props.value} onChange={(event) => props.onChange([...event.currentTarget.selectedOptions].map((option) => option.value))}>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>;
}

function DistrictSelect(props: { regionId?: RegionId; label: string; value: string; optional?: boolean; emptyLabel?: string; active?: boolean; onArm?(): void; onChange(value: string): void }) {
  const id = useId();
  return <div className={`target-field ${props.active ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={id}>{props.label}</label>{props.onArm !== undefined && <button type="button" className="target-arm" onClick={props.onArm}>Select on map</button>}</div><select id={id} value={props.value} onFocus={props.onArm} onChange={(event) => props.onChange(event.target.value)}><option value="">{props.emptyLabel ?? (props.optional ? "None / recovery" : "Choose district")}</option>{DISTRICTS.filter((district) => props.regionId === undefined || district.regionId === props.regionId).map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div>;
}

function PartyField(props: { label: string; value: PartyId | ""; optional?: boolean; actingParty: PartyId; allowActingParty?: boolean; active?: boolean; onArm?(): void; onChange(value: PartyId | ""): void }) {
  const id = useId();
  return <div className={`target-field ${props.active ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={id}>{props.label}</label>{props.onArm !== undefined && <button type="button" className="target-arm" onClick={props.onArm}>Select party file</button>}</div><select id={id} value={props.value} onFocus={props.onArm} onChange={(event) => props.onChange(event.target.value as PartyId | "")}>
    {props.optional && <option value="">Choose party</option>}
    {PARTIES.filter((party) => props.allowActingParty === true || party.id !== props.actingParty).map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
  </select></div>;
}

function PartySelect(props: { partyId: PartyId; partyIds: PartyId[]; onPartyId(partyId: PartyId): void; disabled?: boolean; active?: boolean; onArm?(): void }) {
  const id = useId();
  return <div className={`target-field ${props.active ? "target-field-active" : ""}`}><div className="target-field-heading"><label htmlFor={id}>Party</label>{props.onArm !== undefined && !props.disabled && <button type="button" className="target-arm" onClick={props.onArm}>Select party file</button>}</div><select id={id} aria-label="Party" value={props.partyId} disabled={props.disabled} onFocus={props.onArm} onChange={(event) => props.onPartyId(event.target.value as PartyId)}>{props.partyIds.map((partyId) => <option key={partyId} value={partyId}>{PARTIES_BY_ID[partyId].name}</option>)}</select></div>;
}

function ElectionBulletin({ view }: { view: GameView }) {
  const election = view.electionHistory.at(-1);
  if (!election) return null;
  return <section className="election-desk paper-panel"><SectionHeading label="Election results" title={`Election ${election.electionNumber}`} slug={`After Year ${election.afterYear}`}/>
    <div className="election-scores">{election.policyVotes.map(vote => <article key={vote.regionId}><strong>{REGION_NAMES[vote.regionId]}</strong><span>{POLICIES_BY_ID[vote.policyId].name}</span><b>{vote.passed ? "Passed" : "Failed"}</b><small>{vote.forVotes} For · {vote.againstVotes} Against</small></article>)}</div>
    {election.afterYear === 6 && <div className="election-scores">{election.scores.map(score => <article key={score.playerId}><strong>{seatName(view, score.playerId)}</strong><b>{score.resultingPoints} points</b><small>Policies {signed(score.policyScore)} · {score.finalCardCount} held cards · Hand rank +{score.finalCardRankBonus}</small><details><summary>Score breakdown</summary><p>Scoring card {election.scoringCards.find(card => card.seatId === score.playerId)?.scoringCardId}</p><ol>{SCORING_CARDS_BY_ID[election.scoringCards.find(card => card.seatId === score.playerId)!.scoringCardId].order.map((category, index) => <li key={category}>{category} · {6-index}</li>)}</ol><ul>{score.policyScores.map(policy => <li key={policy.policyId}>{POLICIES_BY_ID[policy.policyId].name}: +{policy.gain} −{policy.loss} = {signed(policy.net)}</li>)}</ul></details></article>)}</div>}
  </section>;
}

function YearArchive({ view }: { view: GameView }) {
  return (
    <section className="year-archive paper-panel">
      <SectionHeading label="Annual record" title="Year archive" slug={`${view.yearHistory.length} closed`} />
      {view.yearHistory.length === 0 ? <p>No year has closed.</p> : (
        <ol>{[...view.yearHistory].reverse().map((record) => <li key={record.year}><b>Year {record.year}</b><span>{seatName(view, record.endedBySeatId)} ended the year</span><small>{record.actions.length} Lobby actions · {record.operations.length} resolved cards</small></li>)}</ol>
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
  view: GameView,
  initial: OperationState,
  seat: ViewSeat,
  partyId: PartyId,
  draft: OperationDraft
): {
  play: OperationPlay | null;
  message: string | null;
} {
  const inventory = seat.operations;
  if (inventory === null) return { play: null, message: "Your private hand is unavailable." };
  if (
    draft.bonusCardId !== "" &&
    BONUS_CARDS_BY_ID[draft.bonusCardId].operation === null
  ) {
    const result = unboundDraftChoice(
      view,
      seat,
      partyId,
      draft.bonusCardId,
      draft.unbound
    );
    return result.choice === null
      ? { play: null, message: result.message }
      : {
          play: {
            cardType: "bonus",
            bonusCardId: draft.bonusCardId,
            choice: result.choice
          },
          message: "Ready to resolve this card."
        };
  }
  if (draft.bonusCardId === "" && inventory[draft.operation] < 1) {
    return { play: null, message: `You do not have a ${draft.operation} card.` };
  }
  const choice = draftChoice(draft);
  if (choice === null) return { play: null, message: "Choose every required target." };
  const resolution = resolveOperation(initial, {
    party: partyId,
    choice,
    ...(draft.bonusCardId === "" ? {} : { bonusCardId: draft.bonusCardId })
  });
  if (!resolution.baselineApplied || (draft.bonusCardId !== "" && !resolution.bonusApplied)) {
    return {
      play: null,
      message: resolution.bonusFailure ?? resolution.failure ?? "That choice is illegal."
    };
  }
  return {
    play: {
      ...(draft.bonusCardId === ""
        ? { cardType: "operation" as const, operation: draft.operation, choice }
        : { cardType: "bonus" as const, bonusCardId: draft.bonusCardId, choice })
    },
    message: "Ready to resolve this card."
  };
}

function unboundDraftChoice(view:GameView,seat:ViewSeat,partyId:PartyId,cardId:BonusCardId,draft:UnboundDraft):{choice:UnboundBonusChoice|null;message:string} {
  let choice: unknown;
  switch(cardId) {
    case 'honeycomb-every-bee-counts': choice={effect:'every_bee_counts'};break;
    case 'honeycomb-common-cause': choice={effect:'common_cause',districtId:draft.districtId,partnerPartyId:draft.partnerPartyId};break;
    case 'foxglove-whisper-network': choice={effect:'whisper_network',sourceDistrictId:draft.sourceDistrictId,destinationDistrictId:draft.destinationDistrictId,rivalPartyId:draft.partnerPartyId};break;
    case 'many-wings-joint-campaign': choice={effect:'joint_campaign',regionId:draft.regionId,forPolicy:draft.forPolicy,destinationDistrictId:draft.destinationDistrictId,moves:draft.campaignMoves};break;
    case 'old-shell-institutional-memory': choice={effect:'institutional_memory',regionId:draft.regionId,forPolicy:draft.forPolicy,placements:Object.entries(draft.policyDistrictIds).filter(([,id])=>id!=='').map(([partyId,destinationDistrictId])=>({partyId,destinationDistrictId}))};break;
    case 'foxglove-shell-firm': choice={effect:'shell_firm',targetPartyId:draft.targetPartyId};break;
    case 'riverworks-mass-transit': choice={effect:'mass_transit',districtIds:draft.transitDistrictIds,supportPartyIds:draft.transitSupportPartyIds};break;
    case 'many-wings-empty-every-nest': choice={effect:'empty_every_nest',sourceDistrictIds:draft.sourceDistrictIds,destinationDistrictIds:draft.destinationDistrictIds};break;
    case 'night-parliament-midnight-session': choice={effect:'midnight_session',targetPartyId:draft.targetPartyId,firmId:draft.firmId};break;
    default:return {choice:null,message:'Choose a Bonus card.'};
  }
  try {
    const state={support:structuredClone(view.support),parties:structuredClone(view.parties),pendingPolicies:{...view.pendingPolicies},seats:view.seats.map(s=>({id:s.id,firmIds:s.firmIds as FirmId[]}))};
    const result=resolveUnboundBonus(state,seat.id,partyId,cardId,choice);
    return {choice:result.choice,message:''};
  } catch(error) {return {choice:null,message:messageOf(error)};}
}

function districtHasFreeSpot(view: GameView, districtId: DistrictId): boolean {
  return districtOccupancy(view.support[districtId]) < DISTRICTS_BY_ID[districtId].capacity;
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
    const choice = draftChoice(candidate);
    if (choice === null) return false;
    return draft.bonusCardId !== "" && target === "bonusDistrictId"
      ? isOperationRequestLegal(state, { party: partyId, choice, bonusCardId: draft.bonusCardId })
      : isOperationChoiceLegal(state, partyId, choice, {allowCanalNetwork: draft.bonusCardId === "riverworks-canal-network"});
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
    if (target === "rivalParty" && draft.districtId === "") return true;
    const candidate = { ...draft, [target]: candidateParty };
    const choice = draftChoice(candidate);
    if (choice === null) return false;
    return isOperationChoiceLegal(state, partyId, choice);
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
  "rivalParty"
> {
  return target === "rivalParty";
}

function defaultOperationTarget(operation: OperationId): OperationTarget {
  if (operation === "organise") return "sourceDistrictId";
  return "districtId";
}

function targetPrompt(target: OperationTarget): string {
  const labels: Record<OperationTarget, string> = {
    actingParty: "Select the party where this Operate action will resolve.",
    sourceDistrictId: "Select the Organise source district on the map.",
    destinationDistrictId: "Select the Organise destination district on the map.",
    districtId: "Select a district on the map. For Smear, click rival Support to fill both targets.",
    rivalParty: "Select the rival party file. To choose both targets together, arm District and click rival Support.",
    bonusDistrictId: "Select the bonus district on the map.",
    bonusDistrictIds: "Select or deselect the required Scatter destinations on the map.",
  };
  return labels[target];
}

function supportTargetId(districtId: string, partyId: PartyId): string {
  return `${districtId}:${partyId}`;
}

function districtOccupancy(support: Partial<Record<PartyId, number>>): number {
  return PARTIES.reduce((total, party) => total + (support[party.id] ?? 0), 0);
}

function draftChoice(draft:OperationDraft):OperationChoice|null {
  const extras={...(draft.followUpOrder===null?{}:{followUpOrder:draft.followUpOrder}),...(draft.freshStartDistrictId?{freshStartDistrictId:draft.freshStartDistrictId}:{}),...(draft.chainSourceDistrictId?{chainSourceDistrictId:draft.chainSourceDistrictId}:{})};
  if(draft.operation==='organise')return draft.destinationDistrictId ? {operation:'organise',destinationDistrictId:draft.destinationDistrictId,...(draft.count!==1||draft.bonusCardId==='riverworks-canal-network'?{count:draft.count}:{}),...(draft.sourceDistrictId?{sourceDistrictId:draft.sourceDistrictId}:{}),...(draft.swapPartyIds.length?{swapPartyIds:draft.swapPartyIds}:{}),...extras}:null;
  if(draft.operation==='rally')return draft.districtId ? {operation:'rally',districtId:draft.districtId,...(draft.sourceDistrictId?{sourceDistrictId:draft.sourceDistrictId}:{}),...(draft.bonusDistrictId?{bonusDistrictId:draft.bonusDistrictId}:{}),...(draft.bonusDistrictIds.length?{bonusDistrictIds:draft.bonusDistrictIds}:{}),...extras}:null;
  return draft.districtId ? {operation:'smear',districtId:draft.districtId,rivalParty:draft.rivalParty,...(draft.displacementDistrictId?{displacementDistrictId:draft.displacementDistrictId}:{}),...(draft.bonusDistrictId?{bonusDistrictId:draft.bonusDistrictId}:{}),...extras}:null;
}

function emptyOperationDraft(
  id: number,
  operation: OperationId,
  actingParty: PartyId
): OperationDraft {
  const target = PARTIES.find((party) => party.id !== actingParty)!.id;
  return {
    id,
    operation,
    sourceDistrictId: "",
    count: 1,
    destinationDistrictId: "",
    districtId: "",
    rivalParty: target,
    bonusDistrictId: "",
    bonusDistrictIds: [],
    swapPartyIds: [],
    displacementDistrictId: "",
    freshStartDistrictId: "",
    chainSourceDistrictId: "",
    followUpOrder: null,
    bonusCardId: "",
    unbound: {
      regionId: "urban", forPolicy: true, policyDistrictIds: {}, districtId: "", sourceDistrictId: "", destinationDistrictId: "", partnerPartyId: "", campaignMoves: [{sourceDistrictId:"",partyId:""}],
      sourceDistrictIds: [],
      targetPartyId: "",
      firmId: "",
      transitDistrictIds: ["", ""],
      transitSupportPartyIds: [""],
      destinationDistrictIds: []
    }
  };
}


function toOperationState(view: GameView): OperationState {
  return {
    districts: Object.fromEntries(DISTRICTS.map((district) => [district.id, { id: district.id, capacity: district.capacity, neighbors: [...district.adjacentDistrictIds], support: { ...view.support[district.id] } }])),
    laws: activeLawEffects(view.enactedPolicyIds)
  };
}

function operationCount(inventory: Record<OperationId, number>): number {
  return OPERATION_IDS.reduce((total, operation) => total + inventory[operation], 0);
}

function activeSeat(view: GameView): string | null {
  if (view.phaseData.type === "opening") return view.phaseData.turnSeatIds[view.phaseData.turnIndex] ?? null;
  if (view.phaseData.type === "lobby") return view.phaseData.activeSeatId;
  if (view.phaseData.type === "closure") {
    const partyId = view.phaseData.pendingPartyIds[0];
    return partyId === undefined ? null : view.parties[partyId]?.ownerSeatId ?? null;
  }
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
  if (phase === "closure") return "Automatic Closure";
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
