import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  try {
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    const data = await response.json();
    console.log('🔍 Resend connection response:', JSON.stringify(data, null, 2));
    
    connectionSettings = data.items?.[0];

    if (!connectionSettings || (!connectionSettings.settings?.api_key)) {
      console.error('❌ Connection settings missing or incomplete:', connectionSettings);
      throw new Error('Resend not connected');
    }
    
    console.log('✅ Resend credentials retrieved successfully');
    return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
  } catch (error) {
    console.error('❌ Error fetching Resend connection:', error);
    throw error;
  }
}

export async function getUncachableResendClient() {
  const {apiKey, fromEmail} = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail
  };
}
