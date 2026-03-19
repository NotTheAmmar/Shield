/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async rewrites() {
        return [
            {
                source: '/api/:microservice/internal/:path*',
                destination: '/404',
            },
            {
                source: '/api/auth/:path*',
                destination: 'http://shield-auth:4000/api/auth/:path*',
            },
            {
                source: '/api/evidence/:path*',
                destination: 'http://shield-evidence:4001/api/evidence/:path*',
            },
            {
                source: '/api/fir/:path*',
                destination: 'http://shield-evidence:4001/api/fir/:path*',
            },
            {
                source: '/api/ledger/:path*',
                destination: 'http://shield-ledger:4002/api/ledger/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
