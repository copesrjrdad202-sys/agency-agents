/**
 * Provisioning CLI: buys a Twilio phone number and registers a new business
 * record so an operator can onboard a customer end-to-end from the terminal.
 *
 * Usage:
 *   npx tsx scripts/provision-business.ts \
 *     --name "Acme Plumbing" \
 *     --areaCode 415 \
 *     --businessType "Plumbing" \
 *     --hours "Mon-Fri 8am-6pm" \
 *     --serviceArea "San Francisco Bay Area" \
 *     --calendarProvider mock
 *
 * Requires TWILIO_ACCOUNT_SID and (TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET,
 * or TWILIO_AUTH_TOKEN) in the environment (.env).
 * After running, tell the customer to forward their existing business line
 * to the newly purchased Twilio number on "no answer" / "busy".
 */
import 'dotenv/config';
import { config } from '../src/config';
import { createBusiness } from '../src/services/businessStore';
import { getTwilioClient } from '../src/services/twilioClient';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const name = key.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[name] = value;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();

  if (!args.name) {
    console.error('Usage: --name "<Business Name>" [--areaCode 415] [--businessType ...] [--hours ...] [--serviceArea ...] [--calendarProvider mock|google|multi-agent] [--googleCalendarId ...] [--forwardingNumber +1...]');
    process.exit(1);
  }

  if (!config.twilio.accountSid) {
    console.error('TWILIO_ACCOUNT_SID must be set in your .env file.');
    process.exit(1);
  }

  const client = getTwilioClient();
  const publicBase = config.publicBaseUrl;
  if (!publicBase) {
    console.error('PUBLIC_BASE_URL must be set (e.g. https://your-domain.com) so Twilio can reach this server.');
    process.exit(1);
  }

  console.log(`Searching for an available number${args.areaCode ? ` in area code ${args.areaCode}` : ''}...`);
  const available = await client.availablePhoneNumbers('US').local.list({
    areaCode: args.areaCode ? parseInt(args.areaCode, 10) : undefined,
    voiceEnabled: true,
    limit: 1,
  });

  if (available.length === 0) {
    console.error('No available numbers found. Try a different area code.');
    process.exit(1);
  }

  const numberToBuy = available[0].phoneNumber;
  console.log(`Purchasing ${numberToBuy}...`);

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: numberToBuy,
    voiceUrl: `${publicBase}/api/twilio/voice`,
    voiceMethod: 'POST',
  });

  console.log(`Purchased and configured: ${purchased.phoneNumber}`);

  const business = createBusiness({
    name: args.name,
    businessType: args.businessType,
    hours: args.hours,
    serviceArea: args.serviceArea,
    twilioNumber: purchased.phoneNumber,
    forwardingNumber: args.forwardingNumber,
    calendarProvider: (args.calendarProvider as any) || 'mock',
    googleCalendarId: args.googleCalendarId,
  });

  console.log('\nBusiness registered:');
  console.log(JSON.stringify(business, null, 2));
  console.log(`\nNext step: tell the customer to forward their existing business line to ${purchased.phoneNumber} on "no answer" and "busy".`);
  console.log('(Exact steps depend on their carrier/phone system — most support call forwarding via *71 / *61 or a PBX admin setting.)');
}

main().catch((err) => {
  console.error('Provisioning failed:', err.message || err);
  process.exit(1);
});
