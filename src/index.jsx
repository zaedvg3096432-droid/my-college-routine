import React from "react";
import { createRoot } from "react-dom/client";
import App from "./AppComponent.jsx";

const rootEl = document.getElementById("root");
const root = createRoot(rootEl);
root.render(React.createElement(App));
