# HTML Templating & Architecture Strategy

**For Website Design Overhaul**

This document provides comprehensive recommendations for modernizing the HTML templating and frontend architecture during the planned website design overhaul.

[← Back to README](../README.md) | [Translation Migration Strategy](./TRANSLATION-MIGRATION-STRATEGY.md)

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Current Architecture](#current-architecture)
- [Industry Standards 2024](#industry-standards-2024)
- [Recommended Approach](#recommended-approach)
- [Rendering Strategies](#rendering-strategies)
- [Component Architecture](#component-architecture)
- [Migration Path](#migration-path)
- [Integration with i18n](#integration-with-i18n)
- [Performance Considerations](#performance-considerations)
- [Implementation Plan](#implementation-plan)

---

## Executive Summary

### Current State
- **Templating**: EJS (Embedded JavaScript) server-side templates
- **Architecture**: Traditional server-rendered pages with client-side vanilla JS/TS
- **Structure**: Monolithic views with some reusable components

### Recommended Future State
- **Framework**: React with TypeScript (industry standard for complex web apps)
- **Meta-Framework**: Next.js (for SSR/SSG/ISR hybrid rendering)
- **Architecture**: Component-based, modular, reusable
- **Rendering**: Hybrid approach (SSG for static pages, SSR for dynamic, SPA for game)
- **Styling**: CSS Modules or Tailwind CSS (modern, scoped styling)

### Key Benefits
✅ Industry-standard component architecture  
✅ Better code organization and reusability  
✅ Excellent TypeScript integration  
✅ Automatic code splitting and performance optimization  
✅ SEO-friendly with server-side rendering  
✅ Vast ecosystem and tooling  
✅ Easy i18next integration (react-i18next)  

---

## Current Architecture

### EJS Server-Side Templating

**Current Setup:**
```
src/
├── server/
│   └── routes/
│       └── *.ts (Express routes rendering EJS)
└── client/
    └── views/
        ├── index.ejs
        ├── play.ejs
        ├── member.ejs
        ├── components/
        │   ├── header.ejs
        │   └── footer.ejs
        └── errors/
            └── 404.ejs
```

**How It Works:**
1. Express server receives request
2. Server fetches data (translations, user info, etc.)
3. Server renders EJS template with data
4. Complete HTML sent to client
5. Client-side JavaScript hydrates interactivity

### Strengths of Current Approach
✅ Simple to understand
✅ Fast time-to-first-byte (TTFB)
✅ Good SEO (server-rendered HTML)
✅ No build step for templates
✅ Works well for simple, content-driven pages

### Limitations for Modern Web Apps
❌ Not component-based (hard to reuse UI elements)  
❌ Poor developer experience for complex UIs  
❌ Limited TypeScript integration in templates  
❌ No automatic code splitting  
❌ Manual state management  
❌ Difficult to build rich, interactive interfaces  
❌ Mixing concerns (HTML, logic, data in one file)  
❌ Limited tooling and ecosystem  

---

## Industry Standards 2024

### Component-Based Architecture Is King

**The modern web has converged on component-based frameworks:**
- React (most popular, huge ecosystem)
- Vue (developer-friendly, growing fast)
- Svelte (emerging, lightweight)
- Angular (enterprise, full framework)

### Framework Comparison

| Feature | EJS (Current) | React | Vue | Svelte |
|---------|---------------|-------|-----|--------|
| **Industry Adoption** | Niche | ⭐⭐⭐⭐⭐ Very High | ⭐⭐⭐⭐ High | ⭐⭐⭐ Growing |
| **Component-Based** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **TypeScript** | ⚠️ Limited | ✅ Excellent | ✅ Excellent | ✅ Good |
| **Learning Curve** | Easy | Moderate | Easy | Easy |
| **Ecosystem Size** | Small | Huge | Large | Growing |
| **Performance** | Good | Excellent | Excellent | Excellent |
| **Job Market** | Low | Very High | High | Growing |
| **Community** | Small | Massive | Large | Active |
| **Tooling** | Basic | Extensive | Extensive | Good |
| **Meta-Framework** | N/A | Next.js | Nuxt.js | SvelteKit |
| **Best For** | Simple SSR | Complex UIs | Flexible apps | Performance-critical |

### Why React Is Industry Standard

**Market dominance:**
- Used by: Facebook, Instagram, Netflix, Airbnb, Uber, Twitter, WhatsApp
- ~70% of component-based framework market share
- Largest job market demand
- Most Stack Overflow questions/answers
- Biggest npm ecosystem

**Technical advantages:**
- Mature and stable (10+ years)
- Excellent TypeScript support
- Virtual DOM for performance
- Huge component library ecosystem
- Server-side rendering support (Next.js)
- Static generation support (Next.js)
- React Server Components (cutting edge)

**Developer experience:**
- Clear separation of concerns
- Reusable components
- Declarative UI
- One-way data flow
- Extensive debugging tools
- Hot module replacement

---

## Recommended Approach

### Framework: React + TypeScript + Next.js

**Rationale:**
1. **React**: Industry standard, vast ecosystem, best tooling
2. **TypeScript**: Type safety, better DX, fewer bugs
3. **Next.js**: Best-in-class React meta-framework for production

### Why Next.js?

**Next.js provides everything needed for production:**
- ✅ Server-side rendering (SSR)
- ✅ Static site generation (SSG)
- ✅ Incremental static regeneration (ISR)
- ✅ API routes (can keep Express backend or migrate)
- ✅ Automatic code splitting
- ✅ File-based routing
- ✅ Built-in CSS/Sass support
- ✅ Image optimization
- ✅ TypeScript support out of the box
- ✅ Excellent i18next integration
- ✅ Production-ready performance

### Alternative: Vue + Nuxt.js

**If team prefers Vue over React:**
- More approachable learning curve
- Single-file components (HTML/JS/CSS together)
- Similar benefits with Nuxt.js
- Smaller but growing ecosystem

**Why React over Vue for infinitechess.org:**
- Larger talent pool for future contributors
- More third-party libraries and components
- Better documented patterns for complex applications
- Existing team likely familiar with React-style JSX

---

## Rendering Strategies

### SSR vs SSG vs SPA: Hybrid Approach

**Different pages have different needs:**

#### Static Site Generation (SSG) - For Static Content
**Use for:**
- Homepage (index)
- About/Credits page
- Terms of Service
- Guide/Documentation
- News list page

**Why:**
- Ultra-fast load times
- Served from CDN
- Perfect SEO
- Minimal server load
- Cost-effective

**Implementation:**
```typescript
// pages/index.tsx
export async function getStaticProps() {
  return {
    props: {
      // Data fetched at build time
    }
  };
}
```

#### Server-Side Rendering (SSR) - For Dynamic Content
**Use for:**
- User profile pages (member)
- Leaderboard (real-time data)
- Admin dashboard
- Login/signup pages (CSRF tokens, etc.)

**Why:**
- Fresh data on every request
- Personalized content
- Better security (server-side auth)
- SEO with dynamic data

**Implementation:**
```typescript
// pages/member/[username].tsx
export async function getServerSideProps(context) {
  const { username } = context.params;
  const userData = await fetchUserData(username);
  
  return {
    props: { userData }
  };
}
```

#### Single Page Application (SPA) - For Interactive App
**Use for:**
- Chess game interface (play)
- Board editor
- Real-time game features

**Why:**
- Maximum interactivity
- No page refreshes
- Complex state management
- WebGL/Canvas rendering
- WebSocket connections

**Implementation:**
```typescript
// pages/play.tsx
// No getStaticProps or getServerSideProps
// All data fetched client-side via hooks
```

#### Incremental Static Regeneration (ISR) - For Semi-Static Content
**Use for:**
- News article pages
- Variant descriptions
- Frequently updated but cacheable content

**Why:**
- Fast like SSG
- Updates without full rebuild
- Best of both worlds

**Implementation:**
```typescript
// pages/news/[slug].tsx
export async function getStaticProps({ params }) {
  const news = await fetchNews(params.slug);
  
  return {
    props: { news },
    revalidate: 3600 // Revalidate every hour
  };
}
```

### Comparison Table

| Page Type | Current | Recommended Strategy | Rationale |
|-----------|---------|---------------------|-----------|
| Home | EJS SSR | SSG | Static content, SEO critical |
| Play (Game) | EJS SSR | SPA | Highly interactive, real-time |
| News | EJS SSR | ISR | Semi-static, SEO important |
| Member Profile | EJS SSR | SSR | Dynamic, personalized |
| Leaderboard | EJS SSR | SSR | Real-time data |
| Guide | EJS SSR | SSG | Static documentation |
| Terms | EJS SSR | SSG | Static legal content |
| Login/Signup | EJS SSR | SSR | Security, CSRF protection |

---

## Component Architecture

### Atomic Design Methodology

**Organize components by complexity:**

```
src/
├── components/
│   ├── atoms/          # Basic building blocks
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Icon.tsx
│   │   └── Text.tsx
│   ├── molecules/      # Simple combinations
│   │   ├── FormField.tsx
│   │   ├── Card.tsx
│   │   └── NavItem.tsx
│   ├── organisms/      # Complex components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── GameBoard.tsx
│   │   └── UserProfile.tsx
│   ├── templates/      # Page layouts
│   │   ├── MainLayout.tsx
│   │   ├── GameLayout.tsx
│   │   └── AuthLayout.tsx
│   └── pages/          # Next.js pages (routes)
│       ├── index.tsx
│       ├── play.tsx
│       ├── news/
│       └── member/
```

### Example Component Structure

**Atom - Button:**
```typescript
// components/atoms/Button.tsx
import { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'small' | 'medium' | 'large';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  children,
  className,
  ...props
}) => {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
```

**Molecule - FormField:**
```typescript
// components/molecules/FormField.tsx
import { Input } from '../atoms/Input';
import { Text } from '../atoms/Text';
import styles from './FormField.module.css';

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  // ... other props
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required,
  ...inputProps
}) => {
  return (
    <div className={styles.formField}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <Input {...inputProps} />
      {error && <Text className={styles.error}>{error}</Text>}
    </div>
  );
};
```

**Organism - Header:**
```typescript
// components/organisms/Header.tsx
import { useTranslation } from 'next-i18next';
import { Button } from '../atoms/Button';
import { NavItem } from '../molecules/NavItem';
import styles from './Header.module.css';

export const Header: React.FC = () => {
  const { t } = useTranslation('header');
  
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        <h1>{t('home')}</h1>
      </div>
      <nav className={styles.nav}>
        <NavItem href="/">{t('home')}</NavItem>
        <NavItem href="/play">{t('play')}</NavItem>
        <NavItem href="/news">{t('news')}</NavItem>
        <NavItem href="/leaderboard">{t('leaderboard')}</NavItem>
      </nav>
      <div className={styles.actions}>
        <Button variant="primary">{t('login')}</Button>
      </div>
    </header>
  );
};
```

**Template - MainLayout:**
```typescript
// components/templates/MainLayout.tsx
import { Header } from '../organisms/Header';
import { Footer } from '../organisms/Footer';
import styles from './MainLayout.module.css';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>
        {children}
      </main>
      <Footer />
    </div>
  );
};
```

**Page - Home:**
```typescript
// pages/index.tsx
import { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { MainLayout } from '../components/templates/MainLayout';
import { Button } from '../components/atoms/Button';

export default function HomePage() {
  const { t } = useTranslation('index');
  
  return (
    <MainLayout>
      <h1>{t('title')}</h1>
      <p>{t('secondary_title')}</p>
      <Button href="/play">{t('play')}</Button>
    </MainLayout>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common', 'header', 'index'])),
    },
  };
};
```

### Benefits of This Structure

✅ **Reusability**: Small components used everywhere  
✅ **Maintainability**: Easy to find and update components  
✅ **Testing**: Small, focused components easy to test  
✅ **Collaboration**: Team members work on different components  
✅ **Type Safety**: TypeScript catches errors at compile time  
✅ **Documentation**: Component props self-document via types  

---

## Migration Path

### Phase 1: Setup Next.js Project

```bash
# Create new Next.js app with TypeScript
npx create-next-app@latest infinitechess-next --typescript --tailwind --app-router

# Install dependencies
cd infinitechess-next
npm install next-i18next react-i18next i18next
npm install @types/node @types/react @types/react-dom
```

**Configure Next.js:**
```javascript
// next.config.js
const { i18n } = require('./next-i18next.config');

module.exports = {
  i18n,
  reactStrictMode: true,
  // ... other config
};
```

**Configure i18next:**
```javascript
// next-i18next.config.js
module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de', 'pl', 'pt-BR', 'zh-CN', 'zh-TW'],
  },
  localePath: './public/locales',
};
```

### Phase 2: Create Component Library

**Start with atoms:**
1. Button, Input, Text, Icon
2. Build Storybook for component documentation
3. Write unit tests

**Then molecules:**
1. FormField, Card, NavItem
2. Test integration

**Then organisms:**
1. Header, Footer
2. Existing complex components

**Finally templates:**
1. MainLayout, GameLayout, AuthLayout

### Phase 3: Migrate Pages One by One

**Order of migration (least to most complex):**

1. **Static pages first** (easiest):
   - Terms of Service → SSG
   - Credits → SSG
   - Guide → SSG

2. **Simple dynamic pages**:
   - Homepage → SSG with ISR
   - News → ISR

3. **User-facing dynamic pages**:
   - Member profile → SSR
   - Leaderboard → SSR

4. **Interactive pages** (hardest):
   - Login/Signup → SSR
   - Play (game) → SPA (most complex, keep for last)

### Phase 4: Migrate Game Interface

**The game is the most complex part:**

**Option A: Gradual (Recommended)**
- Keep game logic in vanilla JS/TS initially
- Wrap in React component
- Gradually refactor to React patterns
- Migrate piece by piece

**Option B: Full Rewrite**
- Completely rewrite game UI in React
- More work but cleaner result
- Better long-term maintainability

### Phase 5: Backend Integration

**Option A: Keep Express Backend (Easier)**
```
Next.js Frontend (SSR/SSG/SPA)
      ↓
Express API Backend (existing)
      ↓
Database/Game Logic
```

**Option B: Next.js API Routes (Cleaner)**
```
Next.js Frontend + API Routes
      ↓
Business Logic
      ↓
Database
```

**Recommendation**: Start with Option A, migrate to Option B over time.

---

## Integration with i18n

### next-i18next (Best Practice)

**Setup:**
```typescript
// pages/_app.tsx
import { appWithTranslation } from 'next-i18next';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default appWithTranslation(MyApp);
```

**Usage in Components:**
```typescript
import { useTranslation } from 'next-i18next';

export const MyComponent = () => {
  const { t } = useTranslation('common');
  
  return (
    <div>
      <h1>{t('welcome')}</h1>
      <p>{t('description', { name: 'User' })}</p>
    </div>
  );
};
```

**Server-Side (SSR/SSG):**
```typescript
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'header', 'footer'])),
    },
  };
}
```

### Automatic Language Detection

```typescript
// next-i18next.config.js
module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de'],
    localeDetection: true, // Automatic detection
  },
};
```

### Language Switcher Component

```typescript
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

export const LanguageSwitcher = () => {
  const router = useRouter();
  const { i18n } = useTranslation();
  
  const changeLanguage = (locale: string) => {
    router.push(router.pathname, router.asPath, { locale });
  };
  
  return (
    <select
      value={i18n.language}
      onChange={(e) => changeLanguage(e.target.value)}
    >
      <option value="en">English</option>
      <option value="es">Español</option>
      <option value="fr">Français</option>
      <option value="de">Deutsch</option>
    </select>
  );
};
```

---

## Performance Considerations

### Automatic Optimizations in Next.js

✅ **Code Splitting**: Automatic per-page  
✅ **Image Optimization**: Built-in `<Image>` component  
✅ **Font Optimization**: Automatic font loading  
✅ **Script Optimization**: Control when scripts load  
✅ **Prefetching**: Automatic link prefetching  
✅ **Compression**: Automatic gzip/brotli  

### Manual Optimizations

**Lazy Loading Components:**
```typescript
import dynamic from 'next/dynamic';

const GameBoard = dynamic(() => import('../components/GameBoard'), {
  loading: () => <p>Loading game...</p>,
  ssr: false, // Don't render on server (WebGL/Canvas)
});
```

**Memoization:**
```typescript
import { memo, useMemo, useCallback } from 'react';

const ExpensiveComponent = memo(({ data }) => {
  const processedData = useMemo(() => {
    return heavyComputation(data);
  }, [data]);
  
  const handleClick = useCallback(() => {
    // Handler logic
  }, []);
  
  return <div>{/* ... */}</div>;
});
```

**Bundle Analysis:**
```bash
# Install analyzer
npm install @next/bundle-analyzer

# Analyze bundle
ANALYZE=true npm run build
```

---

## Implementation Plan

### Phase 1: Setup (Week 1-2)
- [ ] Create new Next.js project alongside existing
- [ ] Set up TypeScript configuration
- [ ] Configure next-i18next
- [ ] Set up development environment
- [ ] Create basic folder structure

### Phase 2: Component Library (Week 3-6)
- [ ] Design system tokens (colors, spacing, typography)
- [ ] Build atomic components (Button, Input, Text, Icon)
- [ ] Build molecule components (FormField, Card, NavItem)
- [ ] Build organism components (Header, Footer)
- [ ] Set up Storybook for documentation
- [ ] Write component tests

### Phase 3: Static Pages (Week 7-9)
- [ ] Create MainLayout template
- [ ] Migrate Terms of Service (SSG)
- [ ] Migrate Credits page (SSG)
- [ ] Migrate Guide/Documentation (SSG)
- [ ] Test and optimize

### Phase 4: Dynamic Pages (Week 10-14)
- [ ] Migrate Homepage (SSG/ISR)
- [ ] Migrate News pages (ISR)
- [ ] Migrate Member profile (SSR)
- [ ] Migrate Leaderboard (SSR)
- [ ] Migrate Login/Signup (SSR)

### Phase 5: Game Interface (Week 15-20)
- [ ] Create GameLayout template
- [ ] Wrap existing game code in React component
- [ ] Migrate game UI elements progressively
- [ ] Test WebGL/Canvas integration
- [ ] Test WebSocket connections
- [ ] Performance optimization

### Phase 6: Backend Integration (Week 21-24)
- [ ] Connect to existing Express API
- [ ] Test authentication flow
- [ ] Test game creation/joining
- [ ] Test real-time features
- [ ] Migrate API routes to Next.js (optional)

### Phase 7: Testing & Optimization (Week 25-28)
- [ ] E2E testing with Playwright
- [ ] Performance testing
- [ ] SEO audit
- [ ] Accessibility audit (WCAG compliance)
- [ ] Bundle size optimization
- [ ] Load testing

### Phase 8: Deployment (Week 29-30)
- [ ] Set up CI/CD for Next.js
- [ ] Deploy to staging
- [ ] Full QA pass
- [ ] Deploy to production
- [ ] Monitor performance and errors

---

## Conclusion

### Summary

**Recommended Stack:**
- **Framework**: React + TypeScript
- **Meta-Framework**: Next.js (SSR/SSG/ISR hybrid)
- **Architecture**: Component-based (Atomic Design)
- **Rendering**: Hybrid (SSG for static, SSR for dynamic, SPA for game)
- **Styling**: CSS Modules or Tailwind CSS
- **i18n**: next-i18next with JSON translations

### Why This Stack?

✅ **Industry Standard**: Used by most modern web applications  
✅ **Future-Proof**: Strong community, long-term support  
✅ **Performance**: Automatic optimizations, code splitting  
✅ **SEO**: Server-side rendering where needed  
✅ **Developer Experience**: Excellent tooling, TypeScript support  
✅ **Scalability**: Component architecture grows with app  
✅ **Maintainability**: Clear structure, testable code  
✅ **Ecosystem**: Huge library of components and tools  

### Perfect Timing

**Website overhaul = perfect opportunity:**
- No backward compatibility concerns
- Can adopt modern best practices from scratch
- Set up for long-term success
- Attract more contributors (React skills common)

### Next Steps

1. **Decision**: Confirm React + Next.js approach
2. **Prototype**: Build simple prototype to validate
3. **Planning**: Detailed timeline and resource allocation
4. **Execution**: Incremental migration starting with static pages
5. **Launch**: Gradual rollout with monitoring

---

## Additional Resources

### Documentation
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev/)
- [next-i18next](https://github.com/i18next/next-i18next)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Learning Resources
- [Next.js Learn Course](https://nextjs.org/learn)
- [React Tutorial](https://react.dev/learn)
- [TypeScript for React Developers](https://www.typescriptlang.org/docs/handbook/react.html)

### Tools
- [Storybook](https://storybook.js.org/) - Component documentation
- [Playwright](https://playwright.dev/) - E2E testing
- [React Testing Library](https://testing-library.com/react) - Component testing
- [Bundle Analyzer](https://www.npmjs.com/package/@next/bundle-analyzer) - Performance

### Examples
- [Next.js Examples](https://github.com/vercel/next.js/tree/canary/examples)
- [Real World Next.js Apps](https://github.com/unicodeveloper/awesome-nextjs)

---

**Document Version**: 1.0  
**Date**: February 2026  
**Status**: Comprehensive Architecture Strategy  
**For**: Website Design Overhaul

**Recommendation**: Migrate to React + TypeScript + Next.js for modern, scalable architecture.
