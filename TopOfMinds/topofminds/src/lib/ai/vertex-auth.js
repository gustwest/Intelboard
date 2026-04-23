import 'server-only';
import { GoogleAuth } from 'google-auth-library';

let _authClient = null;

function getAuth() {
  if (!_authClient) {
    _authClient = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return _authClient;
}

export async function getAccessToken() {
  const client = await getAuth().getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse?.token) {
    throw new Error('Failed to obtain Google Cloud access token');
  }
  return tokenResponse.token;
}

export function getVertexConfig() {
  const project = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || 'global';
  if (!project) {
    throw new Error('GCP_PROJECT_ID environment variable is required for Vertex AI');
  }
  return { project, location };
}

// The global endpoint drops the region prefix from the hostname.
export function getVertexBaseUrl(location) {
  return location === 'global'
    ? 'https://aiplatform.googleapis.com'
    : `https://${location}-aiplatform.googleapis.com`;
}
