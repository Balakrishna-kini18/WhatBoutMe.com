import { describe, it, expect } from "vitest";
import {
  SIDEBAR_ROUTES,
  isRouteActive,
  shouldHideSidebar,
  type NavRouteItem,
} from "./sidebarNavigationLogic";

describe("Sidebar Navigation Logic", () => {
  const getRoute = (id: string): NavRouteItem => {
    const route = SIDEBAR_ROUTES.find((r) => r.id === id);
    if (!route) throw new Error(`Route ${id} not found`);
    return route;
  };

  describe("isRouteActive", () => {
    it("correctly identifies active state for Dashboard", () => {
      const dashboard = getRoute("dashboard");
      expect(isRouteActive(dashboard, "/")).toBe(true);
      expect(isRouteActive(dashboard, "/courses")).toBe(false);
      expect(isRouteActive(dashboard, "/notes")).toBe(false);
    });

    it("correctly identifies active state for My Courses across steps and programs", () => {
      const courses = getRoute("courses");
      expect(isRouteActive(courses, "/courses")).toBe(true);
      expect(isRouteActive(courses, "/courses/intro")).toBe(true);
      expect(isRouteActive(courses, "/programs/prog-123")).toBe(true);
      expect(isRouteActive(courses, "/steps/step-456")).toBe(true);
      expect(isRouteActive(courses, "/profile")).toBe(false);
      expect(isRouteActive(courses, "/")).toBe(false);
    });

    it("correctly identifies active state for My Notes", () => {
      const notes = getRoute("notes");
      expect(isRouteActive(notes, "/notes")).toBe(true);
      expect(isRouteActive(notes, "/notes/chapter-1")).toBe(true);
      expect(isRouteActive(notes, "/courses")).toBe(false);
    });

    it("correctly identifies active state for Live Sessions", () => {
      const live = getRoute("live");
      expect(isRouteActive(live, "/live")).toBe(true);
      expect(isRouteActive(live, "/live/meeting-123")).toBe(true);
      expect(isRouteActive(live, "/attendance")).toBe(false);
    });

    it("correctly identifies active state for Attendance", () => {
      const attendance = getRoute("attendance");
      expect(isRouteActive(attendance, "/attendance")).toBe(true);
      expect(isRouteActive(attendance, "/events")).toBe(false);
    });

    it("correctly identifies active state for Certificates", () => {
      const certs = getRoute("certificates");
      expect(isRouteActive(certs, "/certificates")).toBe(true);
      expect(isRouteActive(certs, "/certificates/cert-789")).toBe(true);
      expect(isRouteActive(certs, "/profile")).toBe(false);
    });

    it("correctly identifies active state for Events under COMMUNITY", () => {
      const events = getRoute("events");
      expect(events.section).toBe("COMMUNITY");
      expect(isRouteActive(events, "/events")).toBe(true);
      expect(isRouteActive(events, "/events/event-abc")).toBe(true);
      expect(isRouteActive(events, "/courses")).toBe(false);
    });
  });

  describe("shouldHideSidebar", () => {
    it("hides sidebar on auth routes", () => {
      expect(shouldHideSidebar("/login")).toBe(true);
      expect(shouldHideSidebar("/signup")).toBe(true);
      expect(shouldHideSidebar("/sso")).toBe(true);
    });

    it("hides sidebar on agreement and checkout focused enrollment flows", () => {
      expect(shouldHideSidebar("/agreement")).toBe(true);
      expect(shouldHideSidebar("/agreement/step-1")).toBe(true);
      expect(shouldHideSidebar("/agreements/ag-123")).toBe(true);
      expect(shouldHideSidebar("/checkout")).toBe(true);
      expect(shouldHideSidebar("/checkout/step-pay")).toBe(true);
    });

    it("does not hide sidebar on main learner portal routes", () => {
      expect(shouldHideSidebar("/")).toBe(false);
      expect(shouldHideSidebar("/courses")).toBe(false);
      expect(shouldHideSidebar("/notes")).toBe(false);
      expect(shouldHideSidebar("/live")).toBe(false);
      expect(shouldHideSidebar("/attendance")).toBe(false);
      expect(shouldHideSidebar("/certificates")).toBe(false);
      expect(shouldHideSidebar("/events")).toBe(false);
      expect(shouldHideSidebar("/profile")).toBe(false);
    });
  });
});
