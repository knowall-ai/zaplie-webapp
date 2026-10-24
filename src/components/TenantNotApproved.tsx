import React from 'react';
import { useTeamsAuth } from '../hooks/useTeamsAuth';
import {
  ACCESS_REQUEST_EMAIL,
  buildAccessRequestMailto,
} from '../utils/tenantAccess';
import heroImage from '../images/zaplie-hero.jpg';
import styles from './TenantNotApproved.module.css';

const APP_NAME = 'Zaplie';

type Props = {
  organisationName: string | null;
  tenantId: string | null;
  email: string | null;
};

/**
 * Shown to signed-in users whose organisation KnowAll hasn't approved yet.
 * Deliberately has no app navigation or data: just two ways to get in touch
 * and a way to sign out.
 */
const TenantNotApproved: React.FC<Props> = ({
  organisationName,
  tenantId,
  email,
}) => {
  const { handleLogout, isLoggingOut } = useTeamsAuth();
  const mailto = buildAccessRequestMailto({
    appName: APP_NAME,
    organisationName,
    tenantId,
    email,
  });

  return (
    <main className={styles.hero}>
      <img className={styles.image} src={heroImage} alt="" aria-hidden />
      <div className={styles.shade} />
      <section className={styles.content} aria-labelledby="not-approved-title">
        <p className={styles.eyebrow}>{APP_NAME}</p>
        <h1 id="not-approved-title" className={styles.title}>
          Your organisation isn't set up on {APP_NAME} yet.
        </h1>
        <p className={styles.lede}>
          {APP_NAME} is open to organisations KnowAll has approved. Get in touch
          and we'll get your team zapping.
        </p>

        <div className={styles.actions}>
          <a className={styles.primary} href={mailto}>
            Request access
          </a>
          <span className={styles.alternative}>
            Or email us at{' '}
            <a
              className={styles.emailLink}
              href={`mailto:${ACCESS_REQUEST_EMAIL}`}
            >
              {ACCESS_REQUEST_EMAIL}
            </a>
          </span>
        </div>

        <dl className={styles.details}>
          <div>
            <dt>Organisation</dt>
            <dd>{organisationName || 'Unknown'}</dd>
          </div>
          <div>
            <dt>Tenant ID</dt>
            <dd>{tenantId || 'Unknown'}</dd>
          </div>
        </dl>

        <button
          type="button"
          className={styles.signOut}
          onClick={() => handleLogout()}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </section>
    </main>
  );
};

export default TenantNotApproved;
