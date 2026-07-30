import { z } from "zod";

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    z.number().finite(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
);

export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
export type JsonObject = z.infer<typeof JsonObjectSchema>;

const uuid = <Brand extends string>(brand: Brand) =>
  z.string().uuid().brand<Brand>();

export const GameIdSchema = uuid("GameId");
export const SeatIdSchema = uuid("SeatId");
export const SpectatorIdSchema = uuid("SpectatorId");
export const EventIdSchema = uuid("EventId");
export const ChatMessageIdSchema = uuid("ChatMessageId");
export const GameIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .brand<"GameIdempotencyKey">();
export const InviteCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z2-9]{6,10}$/)
  .brand<"InviteCode">();
export const AccessTokenSchema = z
  .string()
  .min(32)
  .max(512)
  .brand<"AccessToken">();

export type GameId = z.infer<typeof GameIdSchema>;
export type SeatId = z.infer<typeof SeatIdSchema>;
export type SpectatorId = z.infer<typeof SpectatorIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type ChatMessageId = z.infer<typeof ChatMessageIdSchema>;
export type GameIdempotencyKey = z.infer<typeof GameIdempotencyKeySchema>;
export type InviteCode = z.infer<typeof InviteCodeSchema>;
export type AccessToken = z.infer<typeof AccessTokenSchema>;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const VersionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const SequenceSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const DisplayNameSchema = z.string().trim().min(1).max(40);
export const ChatTextSchema = z.string().trim().min(1).max(2_000);

export const CounterbidTimerSettingsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("off") }).strict(),
  z
    .object({
      mode: z.literal("countdown"),
      durationSeconds: z.number().int().min(5).max(3_600)
    })
    .strict()
]);
export type CounterbidTimerSettings = z.infer<
  typeof CounterbidTimerSettingsSchema
>;

export const SeatRoleSchema = z.enum(["host", "player"]);
export const ControllerKindSchema = z.enum(["human", "agent"]);
export const JoinRoleSchema = z.enum(["player", "spectator"]);
export type SeatRole = z.infer<typeof SeatRoleSchema>;
export type ControllerKind = z.infer<typeof ControllerKindSchema>;
export type JoinRole = z.infer<typeof JoinRoleSchema>;

export const LobbyConfigurationSchema = z
  .object({
    playerCount: z.number().int().min(2).max(6),
    counterbidTimer: CounterbidTimerSettingsSchema,
    allowSpectators: z.boolean()
  })
  .strict();
export type LobbyConfiguration = z.infer<typeof LobbyConfigurationSchema>;

export const CreateLobbyRequestSchema = z
  .object({
    displayName: DisplayNameSchema,
    controller: ControllerKindSchema,
    configuration: LobbyConfigurationSchema
  })
  .strict();
export type CreateLobbyRequest = z.infer<typeof CreateLobbyRequestSchema>;

export const JoinLobbyRequestSchema = z
  .object({
    inviteCode: InviteCodeSchema,
    displayName: DisplayNameSchema,
    controller: ControllerKindSchema,
    role: JoinRoleSchema
  })
  .strict();
export type JoinLobbyRequest = z.infer<typeof JoinLobbyRequestSchema>;

export const SeatSessionSchema = z
  .object({
    participantType: z.literal("seat"),
    gameId: GameIdSchema,
    seatId: SeatIdSchema,
    accessToken: AccessTokenSchema
  })
  .strict();
export const SpectatorSessionSchema = z
  .object({
    participantType: z.literal("spectator"),
    gameId: GameIdSchema,
    spectatorId: SpectatorIdSchema,
    accessToken: AccessTokenSchema
  })
  .strict();
export const ParticipantSessionSchema = z.discriminatedUnion("participantType", [
  SeatSessionSchema,
  SpectatorSessionSchema
]);
export type SeatSession = z.infer<typeof SeatSessionSchema>;
export type SpectatorSession = z.infer<typeof SpectatorSessionSchema>;
export type ParticipantSession = z.infer<typeof ParticipantSessionSchema>;

export const LobbySeatSchema = z
  .object({
    seatId: SeatIdSchema,
    seatIndex: z.number().int().nonnegative().max(5),
    displayName: DisplayNameSchema,
    role: SeatRoleSchema,
    controller: ControllerKindSchema,
    ready: z.boolean()
  })
  .strict();
export const LobbySpectatorSchema = z
  .object({
    spectatorId: SpectatorIdSchema,
    displayName: DisplayNameSchema,
    controller: ControllerKindSchema
  })
  .strict();
export type LobbySeat = z.infer<typeof LobbySeatSchema>;
export type LobbySpectator = z.infer<typeof LobbySpectatorSchema>;

export const GameLifecycleSchema = z.enum(["lobby", "active", "completed"]);
export type GameLifecycle = z.infer<typeof GameLifecycleSchema>;

export const PublicGameStateSchema = z
  .object({
    gameId: GameIdSchema,
    version: VersionSchema,
    latestSequence: SequenceSchema,
    lifecycle: GameLifecycleSchema,
    configuration: LobbyConfigurationSchema,
    seats: z.array(LobbySeatSchema).max(6),
    spectators: z.array(LobbySpectatorSchema),
    publicGame: JsonObjectSchema.nullable()
  })
  .strict();
export type PublicGameState = z.infer<typeof PublicGameStateSchema>;

export const SeatPrivateStateSchema = z
  .object({
    seatId: SeatIdSchema,
    privateGame: JsonObjectSchema.nullable()
  })
  .strict();
export type SeatPrivateState = z.infer<typeof SeatPrivateStateSchema>;

export const FullInformationStateSchema = z
  .object({
    fullGame: JsonObjectSchema
  })
  .strict();
export type FullInformationState = z.infer<typeof FullInformationStateSchema>;

export const ViewerStateEnvelopeSchema = z.discriminatedUnion("scope", [
  z
    .object({
      scope: z.literal("public"),
      publicState: PublicGameStateSchema
    })
    .strict(),
  z
    .object({
      scope: z.literal("seat"),
      viewerSeatId: SeatIdSchema,
      publicState: PublicGameStateSchema,
      seatState: SeatPrivateStateSchema
    })
    .strict()
    .refine((value) => value.viewerSeatId === value.seatState.seatId, {
      message: "Viewer seat and private state seat must match",
      path: ["seatState", "seatId"]
    }),
  z
    .object({
      scope: z.literal("completed_replay"),
      publicState: PublicGameStateSchema,
      fullState: FullInformationStateSchema
    })
    .strict()
    .refine((value) => value.publicState.lifecycle === "completed", {
      message: "Full information is available only for completed games",
      path: ["publicState", "lifecycle"]
    })
]);
export type ViewerStateEnvelope = z.infer<typeof ViewerStateEnvelopeSchema>;

export const CreateLobbyResponseSchema = z
  .object({
    inviteCode: InviteCodeSchema,
    session: SeatSessionSchema,
    state: ViewerStateEnvelopeSchema
  })
  .strict();
export const JoinLobbyResponseSchema = z
  .object({
    session: ParticipantSessionSchema,
    state: ViewerStateEnvelopeSchema
  })
  .strict();
export type CreateLobbyResponse = z.infer<typeof CreateLobbyResponseSchema>;
export type JoinLobbyResponse = z.infer<typeof JoinLobbyResponseSchema>;

export const OperationInventorySchema = z
  .object({
    organise: z.number().int().nonnegative(),
    rally: z.number().int().nonnegative(),
    smear: z.number().int().nonnegative(),
    court: z.number().int().nonnegative()
  })
  .strict();
export type OperationInventory = z.infer<typeof OperationInventorySchema>;

export const SetLobbyReadyCommandSchema = z
  .object({
    type: z.literal("set_lobby_ready"),
    ready: z.boolean()
  })
  .strict();
export const StartGameCommandSchema = z
  .object({
    type: z.literal("start_game")
  })
  .strict();
export const StartLobbyCommandSchema = StartGameCommandSchema;
export const PostChatCommandSchema = z
  .object({
    type: z.literal("post_chat"),
    message: ChatTextSchema
  })
  .strict();
export const GiveResourcesCommandSchema = z
  .object({
    type: z.literal("give_resources"),
    recipientSeatId: SeatIdSchema,
    clout: z.number().int().nonnegative(),
    operations: OperationInventorySchema,
    points: z.number().int().nonnegative()
  })
  .strict()
  .refine(
    ({ clout, operations, points }) =>
      clout +
        points +
        operations.organise +
        operations.rally +
        operations.smear +
        operations.court >
      0,
    { message: "A gift must contain at least one resource" }
  );
export const GameActionCommandSchema = z
  .object({
    type: z.literal("game_action"),
    action: z
      .object({
        type: z.string().trim().min(1).max(100)
      })
      .catchall(JsonValueSchema)
  })
  .strict();

export const GameCommandSchema = z.union([
  SetLobbyReadyCommandSchema,
  StartGameCommandSchema,
  PostChatCommandSchema,
  GiveResourcesCommandSchema,
  GameActionCommandSchema
]);
export type SetLobbyReadyCommand = z.infer<typeof SetLobbyReadyCommandSchema>;
export type StartGameCommand = z.infer<typeof StartGameCommandSchema>;
export type StartLobbyCommand = StartGameCommand;
export type PostChatCommand = z.infer<typeof PostChatCommandSchema>;
export type GiveResourcesCommand = z.infer<typeof GiveResourcesCommandSchema>;
export type GameActionCommand = z.infer<typeof GameActionCommandSchema>;
export type GameCommand = z.infer<typeof GameCommandSchema>;

export const CommandEnvelopeSchema = z
  .object({
    gameId: GameIdSchema,
    idempotencyKey: GameIdempotencyKeySchema,
    expectedVersion: VersionSchema.optional(),
    command: GameCommandSchema
  })
  .strict();
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

export const CommandAcceptedSchema = z
  .object({
    gameId: GameIdSchema,
    idempotencyKey: GameIdempotencyKeySchema,
    version: VersionSchema,
    latestSequence: SequenceSchema
  })
  .strict();
export type CommandAccepted = z.infer<typeof CommandAcceptedSchema>;

export const ProtocolErrorCodeSchema = z.enum([
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "version_conflict",
  "idempotency_conflict",
  "illegal_action",
  "phase_closed",
  "game_complete",
  "rate_limited",
  "internal_error"
]);
export const ValidationIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
    code: z.string().min(1),
    message: z.string().min(1)
  })
  .strict();
export const ProtocolErrorSchema = z
  .object({
    code: ProtocolErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    currentVersion: VersionSchema.optional(),
    validationIssues: z.array(ValidationIssueSchema).optional(),
    details: JsonObjectSchema.optional()
  })
  .strict();
export const ErrorResponseSchema = z
  .object({
    error: ProtocolErrorSchema
  })
  .strict();
export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

const ProjectedEventBaseSchema = z.object({
  eventId: EventIdSchema,
  gameId: GameIdSchema,
  sequence: SequenceSchema,
  version: VersionSchema,
  occurredAt: IsoDateTimeSchema,
  eventType: z.string().trim().min(1).max(100)
});

export const ProjectedEventEnvelopeSchema = z.discriminatedUnion("scope", [
  ProjectedEventBaseSchema.extend({
    scope: z.literal("public"),
    publicData: JsonObjectSchema
  }).strict(),
  ProjectedEventBaseSchema.extend({
    scope: z.literal("seat"),
    viewerSeatId: SeatIdSchema,
    publicData: JsonObjectSchema,
    seatData: JsonObjectSchema
  }).strict(),
  ProjectedEventBaseSchema.extend({
    scope: z.literal("completed_replay"),
    fullData: JsonObjectSchema
  }).strict()
]);
export type ProjectedEventEnvelope = z.infer<
  typeof ProjectedEventEnvelopeSchema
>;

export const ReplayResponseSchema = z
  .object({
    gameId: GameIdSchema,
    latestSequence: SequenceSchema,
    events: z.array(ProjectedEventEnvelopeSchema)
  })
  .strict()
  .refine(
    ({ events }) => events.every((event) => event.scope === "completed_replay"),
    {
      message: "Replay events must expose completed-game information",
      path: ["events"]
    }
  );
export type ReplayResponse = z.infer<typeof ReplayResponseSchema>;

export const ClientWebSocketFrameSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("authenticate"),
      gameId: GameIdSchema,
      accessToken: AccessTokenSchema,
      afterSequence: SequenceSchema.optional()
    })
    .strict(),
  z.object({ type: z.literal("ping"), nonce: z.string().max(128) }).strict()
]);
export type ClientWebSocketFrame = z.infer<typeof ClientWebSocketFrameSchema>;

export const ServerWebSocketFrameSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("authenticated"),
      gameId: GameIdSchema,
      latestSequence: SequenceSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("snapshot"),
      state: ViewerStateEnvelopeSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("event"),
      event: ProjectedEventEnvelopeSchema
    })
    .strict(),
  z.object({ type: z.literal("error"), error: ProtocolErrorSchema }).strict(),
  z.object({ type: z.literal("pong"), nonce: z.string().max(128) }).strict()
]);
export type ServerWebSocketFrame = z.infer<typeof ServerWebSocketFrameSchema>;
