import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentialsFromReplit() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  if (!hostname) {
    throw new Error('REPLIT_CONNECTORS_HOSTNAME not found');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Resend connector fetch failed: ${response.status}`);
  }

  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings?.api_key)) {
    throw new Error('Resend not connected via Replit connector');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

async function getCredentials() {
  // First try environment variable (works in both dev and production)
  if (process.env.RESEND_API_KEY) {
    console.log('Using RESEND_API_KEY from environment');
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL || 'contact@notifications.roster-app.com'
    };
  }
  
  // Fallback to Replit connector
  console.log('Falling back to Replit connector for Resend');
  return getCredentialsFromReplit();
}

export async function getUncachableResendClient() {
  try {
    const {apiKey, fromEmail} = await getCredentials();
    return {
      client: new Resend(apiKey),
      fromEmail: fromEmail
    };
  } catch (error) {
    console.error('Failed to initialize Resend client:', error);
    throw error;
  }
}
