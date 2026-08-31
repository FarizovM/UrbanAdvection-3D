type ErrorNotificationProps = {
    error: string | null;
    setError: (err: string | null) => void;
};

export function ErrorNotification({ error, setError }: ErrorNotificationProps) {
    if (!error) return null;
    return (
        <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 4, background: '#8b1e1e', color: 'white', padding: '12px 16px', borderRadius: '8px', maxWidth: '360px' }}>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: '10px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
    );
}
