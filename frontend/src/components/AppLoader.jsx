import { useBranding } from '../context/BrandingContext';

export default function AppLoader({ message = 'Initializing application…' }) {
  const { appName, appInitial } = useBranding();

  return (
    <div className="app-loader">
      <div className="app-loader-card">
        <div className="app-loader-mark" aria-hidden="true">{appInitial}</div>
        <div className="app-loader-title">{appName}</div>
        <div className="app-loader-bar" aria-hidden="true">
          <span className="app-loader-seg" />
          <span className="app-loader-seg" />
          <span className="app-loader-seg" />
        </div>
        <p className="app-loader-message">{message}</p>
      </div>
    </div>
  );
}
