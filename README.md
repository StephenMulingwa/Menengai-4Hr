Menengai_4HR is a Next.js app for running Menengai logistics reports from Wialon.

## What it does

- Choose a **time period** (Start/End, interpreted as EAT / UTC+3)
- Either:
  - **Upload an Excel** containing a `Registration Number` column, then click **Run report**, or
  - **Select Menengai vehicles** (filtered from Wialon unit names), then click **Run report**
- Downloads an Excel report with sheets:
  - `Last Location`
  - `Mileage` (includes `Mileage 4HRs`)
  - `Geofences`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Environment variables

Set this in your local `.env.local` (and also in Vercel project settings):

```bash
WIALON_TOKEN=your_wialon_token_here
```

## Deploy on Vercel

- Import the project into Vercel
- Set the **Root Directory** to `menengai_4hr` (this folder)
- Add the env var `WIALON_TOKEN`
- Deploy

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
