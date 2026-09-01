import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import NetworkStatusBar from './components/NetworkStatusBar';
import AppLoader from './components/AppLoader';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { NetworkProvider } from './context/NetworkContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PublicLeadForm from './pages/PublicLeadForm';

const Contacts = lazy(() => import('./pages/Contacts'));
const Leads = lazy(() => import('./pages/Leads'));
const Deals = lazy(() => import('./pages/Deals'));
const Quotations = lazy(() => import('./pages/Quotations'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Documents = lazy(() => import('./pages/Documents'));
const Internships = lazy(() => import('./pages/Internships'));
const FindJobs = lazy(() => import('./pages/FindJobs'));
const AtsScanner = lazy(() => import('./pages/AtsScanner'));
const ResumeBuilder = lazy(() => import('./pages/ResumeBuilder'));
const SeoAnalysis = lazy(() => import('./pages/SeoAnalysis'));
const Automation = lazy(() => import('./pages/Automation'));
const AlertSms = lazy(() => import('./pages/AlertSms'));
const Analytics = lazy(() => import('./pages/Analytics'));
const LoadTesting = lazy(() => import('./pages/LoadTesting'));
const SecurityAnalytics = lazy(() => import('./pages/SecurityAnalytics'));
const SecurityHub = lazy(() => import('./pages/SecurityHub'));
const PortScan = lazy(() => import('./pages/PortScan'));
const NetworkDevices = lazy(() => import('./pages/NetworkDevices'));
const DnsSecurity = lazy(() => import('./pages/DnsSecurity'));
const DdosAttack = lazy(() => import('./pages/DdosAttack'));
const PhishingAttack = lazy(() => import('./pages/PhishingAttack'));
const CameraJam = lazy(() => import('./pages/CameraJam'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Chatbot = lazy(() => import('./pages/Chatbot'));
const AiImageGenerator = lazy(() => import('./pages/AiImageGenerator'));
const AiCodeWorkspace = lazy(() => import('./pages/AiCodeWorkspace'));
const Settings = lazy(() => import('./pages/Settings'));
const Roles = lazy(() => import('./pages/Roles'));
const Users = lazy(() => import('./pages/Users'));
const ActiveSessions = lazy(() => import('./pages/ActiveSessions'));

function LazyPage({ children }) {
  return <Suspense fallback={<AppLoader message="Loading…" />}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrandingProvider>
      <NetworkProvider>
        <NetworkStatusBar />
        <AuthProvider>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/f/:slug" element={<PublicLeadForm />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route element={<ProtectedRoute permission="dashboard:view" />}>
                <Route index element={<Dashboard />} />
              </Route>
              <Route element={<ProtectedRoute permission="leads:view" />}>
                <Route path="leads" element={<LazyPage><Leads /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="contacts:view" />}>
                <Route path="contacts" element={<LazyPage><Contacts /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="deals:view" />}>
                <Route path="deals" element={<LazyPage><Deals /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="quotations:view" />}>
                <Route path="quotations" element={<LazyPage><Quotations /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="tasks:view" />}>
                <Route path="tasks" element={<LazyPage><Tasks /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="documents:view" />}>
                <Route path="documents" element={<LazyPage><Documents /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="internships:view" />}>
                <Route path="internships" element={<LazyPage><Internships /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="jobs:view" />}>
                <Route path="find-jobs" element={<LazyPage><FindJobs /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="ats:view" />}>
                <Route path="ats-scanner" element={<LazyPage><AtsScanner /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="resumebuilder:view" />}>
                <Route path="resume-builder" element={<LazyPage><ResumeBuilder /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="seo:view" />}>
                <Route path="seo-analysis" element={<LazyPage><SeoAnalysis /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="automation:view" />}>
                <Route path="automation" element={<LazyPage><Automation /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="alertsms:view" />}>
                <Route path="alert-sms" element={<LazyPage><AlertSms /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="analytics:view" />}>
                <Route path="analytics" element={<LazyPage><Analytics /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="loadtest:view" />}>
                <Route path="load-testing" element={<LazyPage><LoadTesting /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="sechub:view" />}>
                <Route path="security-hub" element={<LazyPage><SecurityHub /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="security:view" />}>
                <Route path="security-analytics" element={<LazyPage><SecurityAnalytics /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="portscan:view" />}>
                <Route path="port-scan" element={<LazyPage><PortScan /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="network:view" />}>
                <Route path="network-devices" element={<LazyPage><NetworkDevices /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="dnssec:view" />}>
                <Route path="dns-security" element={<LazyPage><DnsSecurity /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="ddos:view" />}>
                <Route path="ddos-attack" element={<LazyPage><DdosAttack /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="phishing:view" />}>
                <Route path="phishing-attack" element={<LazyPage><PhishingAttack /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="camjam:view" />}>
                <Route path="camera-jam" element={<LazyPage><CameraJam /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="integrations:manage" />}>
                <Route path="integrations" element={<LazyPage><Integrations /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="ai:chat" />}>
                <Route path="chatbot" element={<LazyPage><Chatbot /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="aiimage:view" />}>
                <Route path="ai-image-generator" element={<LazyPage><AiImageGenerator /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="aicode:view" />}>
                <Route path="ai-code-workspace" element={<LazyPage><AiCodeWorkspace /></LazyPage>} />
              </Route>
              <Route path="settings" element={<LazyPage><Settings /></LazyPage>} />
              <Route element={<ProtectedRoute permission="roles:manage" />}>
                <Route path="roles" element={<LazyPage><Roles /></LazyPage>} />
              </Route>
              <Route element={<ProtectedRoute permission="users:manage" />}>
                <Route path="users" element={<LazyPage><Users /></LazyPage>} />
                <Route path="active-sessions" element={<LazyPage><ActiveSessions /></LazyPage>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
          </Routes>
        </AuthProvider>
      </NetworkProvider>
    </BrandingProvider>
  );
}
