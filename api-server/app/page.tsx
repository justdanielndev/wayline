export default function Home() {
  return (
    <div>
      <h1>Wayline API Server</h1>
      <p>Public Endpoints:</p>
      <p><code>GET /available_providers.json</code> - Retrieves all providers supported by Wayline</p>
      <p><code>GET /providers/lines/[provider]/[line].png</code> - Retrieves the icon for a specific provider's line</p>
      <p><code>GET /providers/logos/[provider].png</code> - Retrieves the logo for a specific provider</p>
    </div>
  );
}