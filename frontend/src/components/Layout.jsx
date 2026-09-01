import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import ChatWidget from './ChatWidget';

const SIDEBAR_KEY = 'vistawin_sidebar_collapsed';

const navSections = [
  {
    label: 'CRM',
    links: [
      { to: '/', label: 'Dashboard', icon: 'D', end: true, permission: 'dashboard:view' },
      { to: '/leads', label: 'Leads', icon: 'L', permission: 'leads:view' },
      { to: '/contacts', label: 'Contacts', icon: 'C', permission: 'contacts:view' },
      { to: '/deals', label: 'Deals', icon: 'P', permission: 'deals:view' },
      { to: '/quotations', label: 'Quotations', icon: 'Q', permission: 'quotations:view' },
      { to: '/tasks', label: 'Tasks', icon: 'T', permission: 'tasks:view' },
      { to: '/documents', label: 'Documents', icon: 'F', permission: 'documents:view' },
      { to: '/internships', label: 'Internships', icon: 'I', permission: 'internships:view' },
      { to: '/automation', label: 'Automation', icon: 'M', permission: 'automation:view' },
      { to: '/alert-sms', label: 'Alert SMS', icon: 'S', permission: 'alertsms:view' },
      { to: '/analytics', label: 'Analytics', icon: 'G', permission: 'analytics:view' },
    ],
  },
  {
    label: 'Cyber Security',
    links: [
      { to: '/security-hub', label: 'Security Hub', icon: 'H', permission: 'sechub:view' },
      { to: '/security-analytics', label: 'Web Security', icon: 'E', permission: 'security:view' },
      { to: '/dns-security', label: 'DNS Security', icon: 'N', permission: 'dnssec:view' },
      { to: '/port-scan', label: 'Port Scan', icon: 'O', permission: 'portscan:view' },
      { to: '/network-devices', label: 'Network', icon: 'N', permission: 'network:view' },
      { to: '/load-testing', label: 'Load Testing', icon: 'K', permission: 'loadtest:view' },
      { to: '/ddos-attack', label: 'DDoS Attack', icon: 'X', permission: 'ddos:view' },
      { to: '/phishing-attack', label: 'Phishing', icon: 'P', permission: 'phishing:view' },
      { to: '/camera-jam', label: 'Camera Jam', icon: 'J', permission: 'camjam:view' },
    ],
  },
  {
    label: 'System',
    links: [
      { to: '/find-jobs', label: 'Find Jobs', icon: 'J', permission: 'jobs:view' },

      { to: '/ats-scanner', label: 'ATS Scanner', icon: 'A', permission: 'ats:view' },

      { to: '/resume-builder', label: 'Resume Builder', icon: 'R', permission: 'resumebuilder:view' },

      { to: '/seo-analysis', label: 'SEO Analysis', icon: 'S', permission: 'seo:view' },

      { to: '/integrations', label: 'Integrations', icon: 'N', permission: 'integrations:manage' },
      { to: '/chatbot', label: 'AI Chat', icon: 'A', permission: 'ai:chat' },
      { to: '/ai-image-generator', label: 'AI Images', icon: 'G', permission: 'aiimage:view' },
      { to: '/ai-code-workspace', label: 'AI Code', icon: 'W', permission: 'aicode:view' },
      { to: '/settings', label: 'Settings', icon: 'S' },
      { to: '/roles', label: 'Roles', icon: 'R', permission: 'roles:manage' },
      { to: '/users', label: 'Users', icon: 'U', permission: 'users:manage' },
      { to: '/active-sessions', label: 'Active Sessions', icon: 'L', permission: 'users:manage' },
    ],
  },
];

export default function Layout() {
  const { user, can, logout } = useAuth();
  const { appName, appTagline, appInitial } = useBranding();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [collapsed]);

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) => !link.permission || can(link.permission)),
    }))
    .filter((section) => section.links.length > 0);

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark">{appInitial}</div>
            {!collapsed && (
              <div className="brand-text">
                <h1>{appName}</h1>
                <p>{appTagline}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          >
            {collapsed ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            )}
          </button>
        </div>

        <nav className="nav">
          {visibleSections.map((section) => (
            <div key={section.label} className="nav-section">
              {!collapsed && <div className="nav-section-label">{section.label}</div>}
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  title={link.label}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <span className="nav-icon">{link.icon}</span>
                  {!collapsed && <span className="nav-label">{link.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <div className="user-chip">
              <strong>{user?.name}</strong>
              <span>{user?.role?.name || 'No role'}</span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary sidebar-logout"
            onClick={logout}
            title="Sign out"
          >
            {collapsed ? '↪' : 'Sign out'}
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <ChatWidget />
    </div>
  );
}
