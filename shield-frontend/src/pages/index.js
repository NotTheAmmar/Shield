export default function Home() {
    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center' }}>
            <h1>Welcome to SHIELD</h1>
            <p>Secure Hash-based Evidence Locker & Database</p>
            <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
                <h2>System Status</h2>
                <p>Frontend: Online</p>
                {/* Connection status components would go here */}
            </div>
        </div>
    );
}
