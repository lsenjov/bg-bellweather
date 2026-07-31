import { resolve } from "node:path";
import { createAppServer } from "./server.js";

const databasePath =
  process.env["BELLWEATHER_DATABASE"] ?? resolve("data/ladder-bidding.sqlite");
const host = process.env["BELLWEATHER_HOST"] ?? "127.0.0.1";
const port = Number(process.env["BELLWEATHER_PORT"] ?? "4317");
const app = createAppServer({ databasePath, host, port });
const address = await app.listen();

process.stdout.write(
  `Bellweather game server listening at http://${address.host}:${address.port}\n`
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
