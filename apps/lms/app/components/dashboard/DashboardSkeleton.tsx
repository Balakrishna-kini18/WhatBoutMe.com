"use client";

import React from "react";
import styles from "../../page.module.css";

export default function DashboardSkeleton() {
  return (
    <div className={styles.dashboard}>
      {/* 1. TOP GREETING BAR SKELETON */}
      <section className={styles.topGreetingBar} aria-label="Loading greeting">
        <div className={styles.greetingLeft}>
          <div
            className="skeleton"
            style={{ width: 280, height: 42, borderRadius: 8, marginBottom: 12 }}
            aria-hidden="true"
          />
          <div
            className="skeleton"
            style={{ width: "80%", maxWidth: 460, height: 18, borderRadius: 6 }}
            aria-hidden="true"
          />
        </div>

        <div className={styles.greetingRight} aria-hidden="true">
          <div
            className="skeleton"
            style={{ width: 180, height: 110, borderRadius: 12, opacity: 0.6 }}
          />
          <div
            className="skeleton"
            style={{ width: 220, height: 90, borderRadius: 16 }}
          />
        </div>
      </section>

      {/* 2. MAIN 2-COLUMN DASHBOARD GRID */}
      <div className={styles.dashboardGrid}>
        {/* LEFT COLUMN: YOUR COURSES CONTAINER SKELETON */}
        <section className={styles.yourCoursesContainer} aria-label="Loading courses">
          <div className={styles.sectionHeaderRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                className="skeleton"
                style={{ width: 38, height: 38, borderRadius: 10 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  className="skeleton"
                  style={{ width: 140, height: 20, borderRadius: 4 }}
                />
                <div
                  className="skeleton"
                  style={{ width: 180, height: 14, borderRadius: 4 }}
                />
              </div>
            </div>
            <div
              className="skeleton"
              style={{ width: 68, height: 16, borderRadius: 4 }}
            />
          </div>

          <div className={styles.coursesGrid2x2} aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <article
                key={i}
                className={styles.courseCard}
                style={{ pointerEvents: "none" }}
              >
                {/* 16:9 Cover Image Skeleton */}
                <div className={styles.courseCoverWrap}>
                  <div
                    className="skeleton"
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>

                {/* Card Body Skeleton */}
                <div className={styles.courseCardBody}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      className="skeleton"
                      style={{ width: "65%", height: 18, borderRadius: 4 }}
                    />
                    <div
                      className="skeleton"
                      style={{ width: 34, height: 16, borderRadius: 4 }}
                    />
                  </div>

                  {/* Progress Bar Track Skeleton */}
                  <div
                    className="skeleton"
                    style={{
                      width: "100%",
                      height: 6,
                      borderRadius: 999,
                      marginBottom: 12,
                    }}
                  />

                  {/* Lessons completed metadata Skeleton */}
                  <div
                    className="skeleton"
                    style={{
                      width: 140,
                      height: 14,
                      borderRadius: 4,
                      marginBottom: 16,
                    }}
                  />

                  {/* Action Button Skeleton */}
                  <div
                    className="skeleton"
                    style={{ width: "100%", height: 40, borderRadius: 10 }}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* RIGHT COLUMN: PROGRESS & CERTIFICATES CARDS SKELETON */}
        <aside className={styles.rightStack} aria-label="Loading progress">
          {/* Card 1: Your Progress */}
          <section className={styles.yourProgressCard} aria-hidden="true">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <div
                className="skeleton"
                style={{ width: 22, height: 22, borderRadius: 6 }}
              />
              <div
                className="skeleton"
                style={{ width: 120, height: 20, borderRadius: 4 }}
              />
            </div>

            <div className={styles.donutsGrid}>
              {/* Donut 1 Skeleton */}
              <div className={styles.donutCol}>
                <div
                  className="skeleton"
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    margin: "0 auto 12px",
                  }}
                />
                <div
                  className="skeleton"
                  style={{
                    width: 90,
                    height: 16,
                    borderRadius: 4,
                    margin: "0 auto 6px",
                  }}
                />
                <div
                  className="skeleton"
                  style={{
                    width: 110,
                    height: 13,
                    borderRadius: 4,
                    margin: "0 auto",
                  }}
                />
              </div>

              {/* Donut 2 Skeleton */}
              <div className={styles.donutCol}>
                <div
                  className="skeleton"
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    margin: "0 auto 12px",
                  }}
                />
                <div
                  className="skeleton"
                  style={{
                    width: 80,
                    height: 16,
                    borderRadius: 4,
                    margin: "0 auto 6px",
                  }}
                />
                <div
                  className="skeleton"
                  style={{
                    width: 100,
                    height: 13,
                    borderRadius: 4,
                    margin: "0 auto",
                  }}
                />
              </div>
            </div>
          </section>

          {/* Card 2: Certificates */}
          <section className={styles.certificatesCard} aria-hidden="true">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  className="skeleton"
                  style={{ width: 22, height: 22, borderRadius: 6 }}
                />
                <div
                  className="skeleton"
                  style={{ width: 110, height: 20, borderRadius: 4 }}
                />
              </div>
              <div
                className="skeleton"
                style={{ width: 60, height: 14, borderRadius: 4 }}
              />
            </div>

            <div
              style={{
                padding: "12px",
                background: "#fffaf5",
                borderRadius: 12,
                border: "1px solid #ffedd5",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  className="skeleton"
                  style={{ width: 32, height: 32, borderRadius: 8 }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    className="skeleton"
                    style={{ width: 140, height: 16, borderRadius: 4 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: 100, height: 12, borderRadius: 4 }}
                  />
                </div>
              </div>
              <div
                className="skeleton"
                style={{ width: 50, height: 28, borderRadius: 6 }}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
