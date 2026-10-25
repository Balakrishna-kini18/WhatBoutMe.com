import React from "react";

export type EmptyStateNamedIcon =
  | "users"
  | "user"
  | "document"
  | "documents"
  | "file"
  | "files"
  | "calendar"
  | "session"
  | "sessions"
  | "dollar"
  | "revenue"
  | "money"
  | "academic"
  | "certificate"
  | "certificates"
  | "graduation"
  | "course"
  | "search";

export function resolveEmptyStateIcon(icon?: React.ReactNode): React.ReactNode {
  if (!icon) {
    return React.createElement(
      "svg",
      {
        width: "24",
        height: "24",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.75",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
      },
      React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
      React.createElement("polyline", { points: "14 2 14 8 20 8" }),
      React.createElement("line", { x1: "16", y1: "13", x2: "8", y2: "13" }),
      React.createElement("line", { x1: "16", y1: "17", x2: "8", y2: "17" }),
      React.createElement("polyline", { points: "10 9 9 9 8 9" })
    );
  }

  if (typeof icon === "string") {
    switch (icon.toLowerCase().trim()) {
      case "users":
      case "user":
        return React.createElement(
          "svg",
          {
            width: "24",
            height: "24",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.75",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          },
          React.createElement("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }),
          React.createElement("circle", { cx: "9", cy: "7", r: "4" }),
          React.createElement("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }),
          React.createElement("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })
        );
      case "document":
      case "documents":
      case "file":
      case "files":
        return React.createElement(
          "svg",
          {
            width: "24",
            height: "24",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.75",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          },
          React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
          React.createElement("polyline", { points: "14 2 14 8 20 8" }),
          React.createElement("path", { d: "M9 15l2 2 4-4" })
        );
      case "calendar":
      case "session":
      case "sessions":
        return React.createElement(
          "svg",
          {
            width: "24",
            height: "24",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.75",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          },
          React.createElement("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }),
          React.createElement("line", { x1: "16", y1: "2", x2: "16", y2: "6" }),
          React.createElement("line", { x1: "8", y1: "2", x2: "8", y2: "6" }),
          React.createElement("line", { x1: "3", y1: "10", x2: "21", y2: "10" })
        );
      case "dollar":
      case "revenue":
      case "money":
        return React.createElement(
          "svg",
          {
            width: "24",
            height: "24",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.75",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          },
          React.createElement("line", { x1: "12", y1: "1", x2: "12", y2: "23" }),
          React.createElement("path", { d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" })
        );
      case "academic":
      case "certificate":
      case "certificates":
      case "graduation":
      case "course":
        return React.createElement(
          "svg",
          {
            width: "24",
            height: "24",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.75",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          },
          React.createElement("polygon", { points: "12 2 2 7 12 12 22 7 12 2" }),
          React.createElement("polyline", { points: "2 17 12 22 22 17" }),
          React.createElement("polyline", { points: "2 12 12 17 22 12" })
        );
      case "search":
        return React.createElement(
          "svg",
          {
            width: "24",
            height: "24",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.75",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
          },
          React.createElement("circle", { cx: "11", cy: "11", r: "8" }),
          React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })
        );
      default:
        return icon;
    }
  }

  return icon;
}
