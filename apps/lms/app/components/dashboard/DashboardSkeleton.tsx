"use client";

import React from "react";
import styles from "../../page.module.css";

export default function DashboardSkeleton() {
  return (
    <div className={styles.dashboard}>
      {/* 1. TOP GREETING BAR SKELETON (Desktop >= 1024px) */}
      <section className={styles.topGreetingBar} aria-label="Loading greeting">
        <div className={styles.heroTopRow}>
          <div className={styles.greetingLeft}>
            <div
              className="skeleton"
              style={{ width: 140, height: 18, borderRadius: 6, marginBottom: 8 }}
              aria-hidden="true"
            />
            <div
              className="skeleton"
              style={{ width: 240, height: 32, borderRadius: 8, marginBottom: 12 }}
              aria-hidden="true"
            />
            <div
              className="skeleton"
              style={{ width: "90%", maxWidth: 440, height: 16, borderRadius: 6 }}
              aria-hidden="true"
            />
          </div>

          <div className={styles.heroVisualCol} aria-hidden="true">
            <div
              className="skeleton"
              style={{ width: 150, height: 110, borderRadius: 12, opacity: 0.5 }}
            />
          </div>
        </div>

        <div className={styles.heroBottomRow} aria-hidden="true">
          <div
            className="skeleton"
            style={{ width: "100%", maxWidth: 540, height: 42, borderRadius: 14 }}
          />
        </div>
      </section>

      {/* 1b. RESPONSIVE "MY COURSES" BANNER SKELETON (Mobile/Tablet < 1024px) */}
      <section className={styles.myCoursesBanner} aria-label="Loading banner">
        <div className={styles.bannerMainRow}>
          <div className={styles.bannerLeftZone}>
            <div
              className={`skeleton ${styles.donutRingWrap}`}
              style={{ borderRadius: "50%" }}
              aria-hidden="true"
            />
            <div className={styles.bannerHeadingGroup}>
              <div
                className="skeleton"
                style={{ width: 140, height: 24, borderRadius: 6, marginBottom: 6 }}
                aria-hidden="true"
              />
              <div
                className="skeleton"
                style={{ width: 220, height: 14, borderRadius: 4 }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className={styles.bannerRightZone}>
            <div
              className="skeleton"
              style={{ width: "100%", height: 38, borderRadius: 10 }}
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      {/* 2. MAIN 2-COLUMN DASHBOARD GRID SKELETON */}
      <div className={styles.dashboardGrid}>
        {/* LEFT COLUMN: YOUR COURSES SECTION SKELETON */}
        <div className={styles.coursesColumn}>
          <section className={styles.yourCoursesContainer} aria-label="Loading courses">
            <div className={styles.sectionHeaderRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  className="skeleton"
                  style={{ width: 36, height: 36, borderRadius: 10 }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    className="skeleton"
                    style={{ width: 120, height: 18, borderRadius: 4 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: 150, height: 13, borderRadius: 4 }}
                  />
                </div>
              </div>
              <div
                className="skeleton"
                style={{ width: 64, height: 16, borderRadius: 4 }}
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
                        marginBottom: 8,
                      }}
                    >
                      <div
                        className="skeleton"
                        style={{ width: "65%", height: 18, borderRadius: 4 }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: 36, height: 18, borderRadius: 999 }}
                      />
                    </div>

                    <div
                      className="skeleton"
                      style={{ width: "50%", height: 14, borderRadius: 4, marginBottom: 10 }}
                    />

                    <div
                      className="skeleton"
                      style={{ width: "100%", height: 5, borderRadius: 999, marginBottom: 10 }}
                    />

                    <div
                      className="skeleton"
                      style={{ width: "60%", height: 13, borderRadius: 4, marginBottom: 14 }}
                    />

                    <div
                      className="skeleton"
                      style={{ width: "100%", height: 40, borderRadius: 12 }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: PROGRESS & CERTIFICATES SKELETON */}
        <aside className={styles.rightStack} aria-label="Loading insights">
          <section className={styles.yourProgressCard} aria-label="Loading progress">
            <div className={styles.cardHeaderWithIcon}>
              <div
                className="skeleton"
                style={{ width: 22, height: 22, borderRadius: 6 }}
              />
              <div
                className="skeleton"
                style={{ width: 120, height: 18, borderRadius: 6 }}
              />
            </div>

            <div className={styles.donutsGrid} aria-hidden="true">
              <div className={styles.donutCol}>
                <div
                  className={`skeleton ${styles.donutRingWrap}`}
                  style={{ borderRadius: "50%" }}
                />
                <div className={styles.donutTextWrap}>
                  <div
                    className="skeleton"
                    style={{ width: "85%", maxWidth: 110, height: 16, borderRadius: 4, marginBottom: 6 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: "95%", maxWidth: 130, height: 13, borderRadius: 4 }}
                  />
                </div>
              </div>

              <div className={styles.donutDivider} aria-hidden="true" />

              <div className={styles.donutCol}>
                <div
                  className={`skeleton ${styles.donutRingWrap}`}
                  style={{ borderRadius: "50%" }}
                />
                <div className={styles.donutTextWrap}>
                  <div
                    className="skeleton"
                    style={{ width: "85%", maxWidth: 110, height: 16, borderRadius: 4, marginBottom: 6 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: "95%", maxWidth: 130, height: 13, borderRadius: 4 }}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className={styles.certificatesWrapper}>
            <div className={styles.certificatesCard}>
              <div className={styles.cardHeaderRow}>
                <div className="skeleton" style={{ width: 110, height: 18, borderRadius: 6 }} />
                <div className="skeleton" style={{ width: 60, height: 14, borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 2].map((i) => (
                  <div key={i} className="skeleton" style={{ width: "100%", height: 56, borderRadius: 12 }} />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
