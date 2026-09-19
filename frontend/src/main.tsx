import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import DocsPage from "./DocsPage";
import "./styles.css";

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const Root = path === "/docs" || path === "/help" ? DocsPage : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);