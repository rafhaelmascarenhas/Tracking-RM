module.exports = {
  apps: [
    {
      name: 'tracking-rm',
      script: 'backend/dist/index.js',
      cwd: '/var/www/tracking-rm',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
