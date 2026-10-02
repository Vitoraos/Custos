export default {
  async scheduled(_event: ScheduledController, env: { TARGET_URL: string }) {
    const res = await fetch(env.TARGET_URL);
    console.log('keepalive', res.status);
  },
};
