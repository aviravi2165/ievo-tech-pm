/**
 * Dashboard — default ERP home module.
 * Replace placeholders with real data when backend modules are wired.
 */
export default function DashboardModule({ currentUser }) {
  const name = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || 'User';

  return (
    <div className="erp-module">
      <header className="erp-module-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {name}. Here is your workspace overview.</p>
      </header>

      <div className="erp-stat-grid">
        <article className="erp-stat-card">
          <span className="erp-stat-label">Open assignments</span>
          <strong className="erp-stat-value">12</strong>
          <span className="erp-stat-hint">Placeholder — connect PM module</span>
        </article>
        <article className="erp-stat-card">
          <span className="erp-stat-label">Due this week</span>
          <strong className="erp-stat-value">5</strong>
          <span className="erp-stat-hint">Placeholder</span>
        </article>
        <article className="erp-stat-card">
          <span className="erp-stat-label">Active projects</span>
          <strong className="erp-stat-value">8</strong>
          <span className="erp-stat-hint">Placeholder</span>
        </article>
        <article className="erp-stat-card erp-stat-card--accent">
          <span className="erp-stat-label">Unread messages</span>
          <strong className="erp-stat-value">—</strong>
          <span className="erp-stat-hint">Use the panel on the right</span>
        </article>
      </div>

      <section className="erp-panel">
        <h2>Recent activity</h2>
        <ul className="erp-activity-list">
          <li>
            <span className="erp-activity-dot" />
            <div>
              <strong>Assignment updated</strong>
              <p>Project Alpha — milestone review scheduled</p>
              <time>2 hours ago</time>
            </div>
          </li>
          <li>
            <span className="erp-activity-dot" />
            <div>
              <strong>New message</strong>
              <p>Internal comms — production floor update</p>
              <time>Today, 9:14 AM</time>
            </div>
          </li>
          <li>
            <span className="erp-activity-dot" />
            <div>
              <strong>Document shared</strong>
              <p>Spec sheet — hospitality suite batch 04</p>
              <time>Yesterday</time>
            </div>
          </li>
        </ul>
      </section>

      <section className="erp-panel">
        <h2>My assignments</h2>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Project</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Approve shop drawings</td>
              <td>Hotel Wing B</td>
              <td>Jun 8</td>
              <td><span className="erp-pill erp-pill--warn">In progress</span></td>
            </tr>
            <tr>
              <td>QC sign-off — upholstery</td>
              <td>Corporate lounge</td>
              <td>Jun 10</td>
              <td><span className="erp-pill">Pending</span></td>
            </tr>
            <tr>
              <td>Vendor coordination</td>
              <td>Resort lobby</td>
              <td>Jun 12</td>
              <td><span className="erp-pill erp-pill--ok">On track</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
