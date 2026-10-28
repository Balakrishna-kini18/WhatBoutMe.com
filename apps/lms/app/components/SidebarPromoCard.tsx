"use client";

import Link from "next/link";
import Image from "next/image";
import styles from "../layout.module.css";

interface SidebarPromoCardProps {
  collapsed?: boolean;
}

export default function SidebarPromoCard({ collapsed = false }: SidebarPromoCardProps) {
  if (collapsed) {
    return (
      <Link
        href="/courses"
        className={styles.sidebarPromoCollapsed}
        title="Keep Learning — Build your skills, grow your future"
        aria-label="Keep Learning"
      >
        <Image
          src="/brand/promo_cap_transparent.webp"
          alt="Keep Learning"
          width={28}
          height={24}
          className={styles.promoCapIconCollapsed}
        />
      </Link>
    );
  }

  return (
    <Link
      href="/courses"
      className={styles.sidebarPromoCard}
      title="Continue learning in your courses"
    >
      <div className={styles.promoTextWrap}>
        <span className={styles.promoTitle}>Keep Learning</span>
        <span className={styles.promoSubtitle}>
          Build your skills
          <br />
          Grow your future
        </span>
      </div>
      <div className={styles.promoArtWrap}>
        <Image
          src="/brand/promo_cap_transparent.webp"
          alt="Graduation Cap"
          width={64}
          height={54}
          priority
          className={styles.promoCapImg}
        />
      </div>
    </Link>
  );
}
