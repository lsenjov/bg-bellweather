import {
  ClientWebSocketFrameSchema,
  ServerWebSocketFrameSchema
} from "@bellweather/protocol";
import type { WebSocket } from "ws";
import { AppError, protocolErrorCode } from "./errors.js";
import { projectEvent, projectState } from "./projection.js";
import type { EventStore } from "./store.js";
import type { StoredEvent } from "./types.js";

interface Subscription {
  socket: WebSocket;
  gameId: string;
  seatId?: string;
}

export class Subscriptions {
  private readonly subscriptions = new Set<Subscription>();

  constructor(private readonly store: EventStore) {}

  attach(socket: WebSocket, gameReference: string): void {
    let subscription: Subscription | undefined;

    socket.once("message", (data) => {
      try {
        const frame = ClientWebSocketFrameSchema.parse(
          JSON.parse(data.toString()) as unknown
        );
        if (frame.type !== "authenticate") {
          throw new AppError(401, "unauthorized", "Authenticate before subscribing");
        }
        const authenticated = this.store.authenticateParticipant(
          gameReference,
          frame.accessToken
        );
        if (frame.gameId !== authenticated.game.id) {
          throw new AppError(
            403,
            "wrong_game",
            "WebSocket frame gameId does not match the route"
          );
        }
        this.store.requireEngineState(authenticated.game.id);
        subscription = {
          socket,
          gameId: authenticated.game.id,
          ...("seat" in authenticated
            ? { seatId: authenticated.seat.id }
            : {})
        };
        this.subscriptions.add(subscription);
        this.send(socket, {
          type: "authenticated",
          gameId: authenticated.game.id,
          latestSequence: authenticated.game.currentVersion
        });
        if (frame.afterSequence === undefined) {
          this.send(socket, {
            type: "snapshot",
            state: projectState(
              this.store,
              authenticated.game,
              "seat" in authenticated ? authenticated.seat.id : undefined
            )
          });
        } else {
          for (const event of this.store.listEvents(
            authenticated.game.id,
            frame.afterSequence
          )) {
            this.send(socket, {
              type: "event",
              event: projectEvent(
                event,
                "seat" in authenticated ? authenticated.seat.id : undefined,
                authenticated.game.status === "finished"
              )
            });
          }
        }
        socket.on("message", (message) => this.handleFrame(socket, message.toString()));
      } catch (error) {
        this.sendError(socket, error);
        socket.close(1008, "Authentication failed");
      }
    });

    socket.on("close", () => {
      if (subscription !== undefined) {
        this.subscriptions.delete(subscription);
      }
    });
  }

  broadcast(event: StoredEvent): void {
    const game = this.store.getGameById(event.gameId);
    for (const subscription of this.subscriptions) {
      if (
        subscription.gameId !== event.gameId ||
        subscription.socket.readyState !== subscription.socket.OPEN
      ) {
        continue;
      }
      this.send(subscription.socket, {
        type: "event",
        event: projectEvent(
          event,
          subscription.seatId,
          game.status === "finished"
        )
      });
    }
  }

  private handleFrame(socket: WebSocket, raw: string): void {
    try {
      const frame = ClientWebSocketFrameSchema.parse(
        JSON.parse(raw) as unknown
      );
      if (frame.type === "ping") {
        this.send(socket, { type: "pong", nonce: frame.nonce });
      }
    } catch (error) {
      this.sendError(socket, error);
    }
  }

  private send(socket: WebSocket, frame: unknown): void {
    socket.send(JSON.stringify(ServerWebSocketFrameSchema.parse(frame)));
  }

  private sendError(socket: WebSocket, error: unknown): void {
    const message = error instanceof Error ? error.message : "Invalid frame";
    const appError =
      error instanceof AppError
        ? error
        : new AppError(400, "invalid_request", message);
    this.send(socket, {
      type: "error",
      error: {
        code: protocolErrorCode(appError),
        message: appError.message,
        retryable: appError.status >= 500
      }
    });
  }
}
