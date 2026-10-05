import styles from "./Certificate.module.css";

export type CertificateDetails = {
  name: string;
  course: string;
  /** ISO date the certificate was approved. */
  issuedAt?: string | null;
  number?: string | null;
};

const longDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

/**
 * The printable certificate: who, which course, when, and its number. The
 * signature line is left empty to be signed by hand.
 * Keep this file identical in the learner portal and the admin app.
 */
export default function Certificate({ name, course, issuedAt, number }: CertificateDetails) {
  const date = longDate(issuedAt);
  return (
    <article className={styles.sheet} aria-label={`Certificate for ${name}`}>
      <div className={styles.band}>
        <span>Certificate</span>
      </div>

      <div className={styles.body}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-dark.png" alt="whatboutme" className={styles.logo} />

        {/* award seal with two ribbon tails */}
        <svg className={styles.seal} viewBox="0 0 120 150" aria-hidden="true">
          <path d="M38 88 24 146l18-9 12 13 10-52z" fill="#a9670f" />
          <path d="M82 88l14 58-18-9-12 13-10-52z" fill="#a9670f" />
          <path
            d="M60 4l10 9 13-3 5 12 13 5-3 13 9 10-9 10 3 13-13 5-5 12-13-3-10 9-10-9-13 3-5-12-13-5 3-13-9-10 9-10-3-13 13-5 5-12 13 3z"
            fill="#efa944"
          />
          <circle cx="60" cy="50" r="30" fill="none" stroke="#ffffff" strokeWidth="2" />
          <path d="M47 51l9 9 18-19" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <p className={styles.lead}>This is to certify that</p>
        <h2 className={styles.name}>{name}</h2>

        <p className={styles.text}>
          has successfully completed the course
          <strong>{course}</strong>
        </p>

        <svg className={styles.divider} viewBox="0 0 600 8" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 4h260M340 4h260" stroke="#14110f" strokeWidth="1" />
          <path d="M270 4l10-3 10 3-10 3zM300 1l6 3-6 3-6-3zM310 4l10-3 10 3-10 3z" fill="#14110f" />
        </svg>

        <p className={styles.text}>
          finishing every lesson and assessment in the programme, delivered by whatboutme and
          facilitated by Roweena Britto, Brain Health Coach.
        </p>

        <div className={styles.foot}>
          <div>
            <p className={styles.verified}>Verified by</p>
            <div className={styles.signature}>
              Roweena Britto
              <span>Founder &amp; Lead Facilitator</span>
            </div>
          </div>
          <div className={styles.signature}>
            {date || "\u00a0"}
            <span>Date of issue</span>
          </div>
          {number && (
            <p className={styles.number}>
              Certificate No.
              <strong>{number}</strong>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
