import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';

export default function PublicLeadForm() {
  const { slug } = useParams();
  const { appName } = useBranding();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });

  useEffect(() => {
    fetch(`/api/public/forms/${slug}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Form not found');
        setForm(data);
      })
      .catch((err) => setError(err.message));
  }, [slug]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/public/forms/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          utmSource: searchParams.get('utm_source') || '',
          utmMedium: searchParams.get('utm_medium') || '',
          utmCampaign: searchParams.get('utm_campaign') || '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not submit');
      setDone(data.message || 'Thanks!');
      setValues({ firstName: '', lastName: '', email: '', phone: '', company: '', notes: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !form) {
    return (
      <div className="public-form-page">
        <div className="public-form-card">
          <h1>Form unavailable</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="public-form-page">
        <div className="public-form-card"><p>Loading form...</p></div>
      </div>
    );
  }

  return (
    <div className="public-form-page">
      <div className="public-form-card">
        <p className="public-brand">{appName}</p>
        <h1>{form.title}</h1>
        {form.description && <p className="public-desc">{form.description}</p>}

        {done ? (
          <div className="success-banner">{done}</div>
        ) : (
          <form onSubmit={handleSubmit} className="form-grid">
            {error && <div className="error-banner">{error}</div>}
            <div className="form-row">
              <label>
                First name
                <input
                  required
                  value={values.firstName}
                  onChange={(e) => setValues({ ...values, firstName: e.target.value })}
                />
              </label>
              <label>
                Last name
                <input
                  required={form.fields?.lastNameRequired !== false}
                  value={values.lastName}
                  onChange={(e) => setValues({ ...values, lastName: e.target.value })}
                />
              </label>
            </div>
            <label>
              Email
              <input
                type="email"
                required={form.fields?.emailRequired !== false}
                value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                required={Boolean(form.fields?.phoneRequired)}
                value={values.phone}
                onChange={(e) => setValues({ ...values, phone: e.target.value })}
              />
            </label>
            {form.fields?.companyEnabled !== false && (
              <label>
                Company
                <input value={values.company} onChange={(e) => setValues({ ...values, company: e.target.value })} />
              </label>
            )}
            {form.fields?.notesEnabled !== false && (
              <label>
                Message
                <textarea value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} />
              </label>
            )}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
