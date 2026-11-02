"use client";

import React from "react";
import styles from "../../page.module.css";

export default function DashboardSkeleton() {
  return (
    <div className={styles.dashboard}>
      {/* 1. TOP GREETING BAR SKELETON */}
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
                style={{ width: 220, height: 32, borderRadius: 8, marginBottom: 12 }}
                aria-hidden="true"
              />
              <div
                className="skeleton"
                style={{ width: "90%", maxWidth: 360, height: 16, borderRadius: 6 }}
                aria-hidden="true"
              />
            </div>

            <div className={styles.heroVisualCol} aria-hidden="true">
              <div
                className="skeleton"
                style={{ width: 120, height: 95, borderRadius: 12, opacity: 0.5 }}
              />
            </div>
          </div>

          <div className={styles.heroBottomRow} aria-hidden="true">
            <div
              className="skeleton"
              style={{ width: "100%", height: 46, borderRadius: 14 }}
            />
          </div>
      </section>

        {/* 2. YOUR PROGRESS SUMMARY SKELETON */}
        <section className={styles.yourProgressCard} aria-label="Loading progress">
          <div className={styles.cardHeaderWithIcon}>
            <div
              className="skeleton"
              style={{ width: 20, height: 20, borderRadius: 6 }}
            />
            <div
              className="skeleton"
              style={{ width: 120, height: 18, borderRadius: 6 }}
            />
          </div>

                <div className={styles.donutsGrid} aria-hidden="true">
                  {[1, 2].map((i) => (
                    <div key={i} className={styles.donutCol}>
                      <div
                        className="skeleton"
                        style={{ width: 56, height: 56, borderRadius: "50%", flexShrink: 0 }}
                      />
                        <div className={styles.donutTextWrap}>
                          <div
                            className="skeleton"
                            style={{ width: 90, height: 14, borderRadius: 4, marginBottom: 6 }}
                          />
                          <div
                            className="skeleton"
                            style={{ width: 130, height: 12, borderRadius: 4 }}
                          />
                        </div>
                      </div>
          ))}
                    </div>
      </section>

                {/* 3. YOUR COURSES SECTION SKELETON */}
                <section className={styles.yourCoursesContainer} aria-label="Loading courses">
                  <div className={styles.sectionHeaderRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        className="skeleton"
                        style={{ width: 34, height: 34, borderRadius: 10 }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div
                          className="skeleton"
                          style={{ width: 110, height: 18, borderRadius: 4 }}
                        />
                        <div
                          className="skeleton"
                          style={{ width: 140, height: 12, borderRadius: 4 }}
                        />
                      </div>
                    </div>
                    <div
                      className="skeleton"
                      style={{ width: 56, height: 14, borderRadius: 4 }}
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
                                  style={{ width: "65%", height: 16, borderRadius: 4 }}
                                />
                                <div
                                  className="skeleton"
                                  style={{ width: 32, height: 16, borderRadius: 999 }}
                                />
                              </div>

                              <div
                                className="skeleton"
                                style={{ width: "50%", height: 12, borderRadius: 4, marginBottom: 8 }}
                              />

                              <div
                                className="skeleton"
                                style={{ width: "100%", height: 4, borderRadius: 999, marginBottom: 8 }}
                              />

                            <div
                              className="skeleton"
                              style={{ width: "60%", height: 12, borderRadius: 4, marginBottom: 10 }}
                            />

                            <div
                              className="skeleton"
                              style={{ width: "100%", height: 34, borderRadius: 10 }}
                            />
                          </div>
                </article>
          ))}
              </div>
          </section>
        </div>
        );
}
