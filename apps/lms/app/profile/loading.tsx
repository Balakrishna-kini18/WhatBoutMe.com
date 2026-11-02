import React from "react";
import styles from "./profile.module.css";

export default function ProfileLoading() {
  return (
    <div className={styles.profileContainer} aria-label="Loading profile">
      <div className={styles.profileContentStack}>
        {/* 1. Hero Card Skeleton */}
        <article className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <div
              className="skeleton"
              style={{ width: 90, height: 90, borderRadius: "50%", flexShrink: 0 }}
              aria-hidden="true"
            />
            <div className={styles.heroIdentity}>
              <div
                className="skeleton"
                style={{ width: 180, height: 28, borderRadius: 6, marginBottom: 8 }}
                aria-hidden="true"
              />
              <div
                className="skeleton"
                style={{ width: 220, height: 16, borderRadius: 4, marginBottom: 12 }}
                aria-hidden="true"
              />
              <div
                className="skeleton"
                style={{ width: 84, height: 24, borderRadius: 9999 }}
                aria-hidden="true"
              />
            </div>
          </div>

        </article>

        {/* 2. Three Stats Cards Skeleton */}
        <section className={styles.statsGrid} aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.statCard}>
              <div
                className="skeleton"
                style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div
                  className="skeleton"
                  style={{ width: 44, height: 26, borderRadius: 4, marginBottom: 6 }}
                />
                <div
                  className="skeleton"
                  style={{ width: 90, height: 16, borderRadius: 4, marginBottom: 4 }}
                />
                <div
                  className="skeleton"
                  style={{ width: 120, height: 12, borderRadius: 4 }}
                />
              </div>
            </div>
          ))}
        </section>

        {/* 3. Two-Column Grid Skeleton */}
        <div className={styles.twoColumnGrid} aria-hidden="true">
          {/* Account Details Skeleton */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionTitleGroup}>
                <div
                  className="skeleton"
                  style={{ width: 38, height: 38, borderRadius: 10 }}
                />
                <div>
                  <div
                    className="skeleton"
                    style={{ width: 130, height: 20, borderRadius: 4, marginBottom: 4 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: 180, height: 13, borderRadius: 4 }}
                  />
                </div>
              </div>
              <div
                className="skeleton"
                style={{ width: 56, height: 28, borderRadius: 8 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ width: "100%", height: 44, borderRadius: 12 }}
                />
              ))}
            </div>
          </section>

          {/* My Courses Skeleton */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionTitleGroup}>
                <div
                  className="skeleton"
                  style={{ width: 38, height: 38, borderRadius: 10 }}
                />
                <div>
                  <div
                    className="skeleton"
                    style={{ width: 110, height: 20, borderRadius: 4, marginBottom: 4 }}
                  />
                  <div
                    className="skeleton"
                    style={{ width: 160, height: 13, borderRadius: 4 }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{ width: "100%", height: 58, borderRadius: 14 }}
                />
              ))}
            </div>
          </section>
        </div>

        {/* 4. Digital Signature Section Skeleton */}
        <section className={styles.sectionCard} aria-hidden="true">
          <div className={styles.sigHeaderRow}>
            <div className={styles.sigTitleGroup}>
              <div
                className="skeleton"
                style={{ width: 38, height: 38, borderRadius: 10 }}
              />
              <div>
                <div
                  className="skeleton"
                  style={{ width: 150, height: 20, borderRadius: 4, marginBottom: 4 }}
                />
                <div
                  className="skeleton"
                  style={{ width: 320, height: 13, borderRadius: 4 }}
                />
              </div>
            </div>
          </div>
          <div
            className="skeleton"
            style={{ width: "100%", height: 140, borderRadius: 16, marginTop: 12 }}
          />
        </section>

        {/* 5. Active Devices & Security Skeleton */}
        <section className={styles.sectionCard} aria-hidden="true">
          <div
            className="skeleton"
            style={{ width: "100%", height: 90, borderRadius: 16 }}
          />
        </section>

        {/* 6. Account Session & Sign Out Skeleton */}
        <section className={styles.sectionCard} aria-hidden="true">
          <div
            className="skeleton"
            style={{ width: "100%", height: 110, borderRadius: 16 }}
          />
        </section>
      </div>
    </div>
  );
}
