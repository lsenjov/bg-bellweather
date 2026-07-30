import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <main>Ladder Bidding web application foundation</main>;
}

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Application root is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
