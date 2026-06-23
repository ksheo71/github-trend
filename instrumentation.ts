export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerCron } = await import('./server/cron/register');
    registerCron();
  }
}
