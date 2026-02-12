/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async rewrites() {
        return [
            {
                source: '/api/auth/:path*',
                destination: 'http://shield-auth:4000/:path*',
            },
            {
                source: '/api/evidence/:path*',
                destination: 'http://shield-evidence:4001/:path*',
            },
            {
                source: '/api/ledger/:path*',
                destination: 'http://shield-ledger:4002/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
