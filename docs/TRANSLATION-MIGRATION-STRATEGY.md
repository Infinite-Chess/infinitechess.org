# Translation System Migration Strategy

**For Website Design Overhaul**

This document provides comprehensive recommendations for migrating to an industry-standard translation system during the planned website design overhaul.

[← Back to README](../README.md) | [Current Translation Guide](./TRANSLATIONS.md) | [Weblate Research](./WEBLATE-RESEARCH.md)

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Industry Standards Analysis](#industry-standards-analysis)
- [Recommended Approach](#recommended-approach)
- [Versioning Strategy](#versioning-strategy)
- [Handling Incomplete Translations](#handling-incomplete-translations)
- [Scalability Considerations](#scalability-considerations)
- [Implementation Plan](#implementation-plan)
- [Technical Architecture](#technical-architecture)
- [Migration Checklist](#migration-checklist)
- [Long-Term Maintenance](#long-term-maintenance)

---

## Executive Summary

### Current State
- TOML files with custom versioning system
- Manual fallback via `removeOutdated()` function
- Limited scalability for large-scale internationalization

### Recommended Future State
- **Format**: JSON with i18next (industry standard for web apps)
- **Structure**: Namespaced, modular approach
- **Versioning**: Git-based with automated CI/CD integration
- **Fallback**: Automatic fallback chain (e.g., fr-CA → fr → en)
- **Management**: Weblate or similar TMS for translator collaboration

### Key Benefits
✅ Industry-standard format with excellent tooling  
✅ Automatic fallback built into i18next (no custom code)  
✅ Scalable namespace structure for growing application  
✅ CI/CD integration for continuous localization  
✅ Better translator experience with TMS integration  

### Migration Timing
**Perfect Opportunity**: During website design overhaul, everything changes anyway. No backward compatibility concerns.

---

## Industry Standards Analysis

### 1. JSON (Recommended for Web Applications)

**Why JSON is the industry standard for modern web apps:**

#### Advantages
- ✅ **Native to JavaScript**: Perfect fit for web applications
- ✅ **Excellent i18next Support**: Most mature integration
- ✅ **Simple Structure**: Easy to read, edit, and automate
- ✅ **Great Tooling**: Extensive ecosystem (linters, validators, TMS integrations)
- ✅ **Namespace Support**: Built-in modular organization
- ✅ **Performance**: Fast parsing, lazy loading support

#### Structure Example
```json
// locales/en/common.json
{
  "save": "Save",
  "cancel": "Cancel",
  "error": "An error occurred"
}

// locales/en/game.json
{
  "title": "Infinite Chess",
  "start_game": "Start Game",
  "piece": {
    "pawn": "Pawn",
    "knight": "Knight",
    "bishop": "Bishop"
  }
}
```

#### i18next Integration
```javascript
i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common', 'game', 'menu'],
  defaultNS: 'common'
});

// Usage
t('common:save')  // "Save"
t('game:piece.pawn')  // "Pawn"
```

### 2. Gettext PO (Alternative for Backend/Full-Stack)

**When to use PO:**
- Backend-heavy applications (Python/Django, PHP)
- Need rich metadata and translator context
- Professional translation workflows with CAT tools

#### Advantages
- ✅ **Rich Metadata**: Context, comments, references
- ✅ **Fuzzy State**: Built-in "needs review" mechanism
- ✅ **Mature Ecosystem**: Decades of tooling
- ✅ **Plural Support**: Excellent handling of plural forms

#### Disadvantages for Web Apps
- ❌ **Not Native to JavaScript**: Requires compilation
- ❌ **More Complex**: Higher learning curve
- ❌ **Build Step Required**: PO → JSON/MO conversion

### 3. XLIFF (Enterprise/Complex Workflows)

**When to use XLIFF:**
- Enterprise translation workflows
- Multiple CAT tool integration
- Complex state management needs

#### Disadvantages
- ❌ **Verbose XML**: Harder to read/edit manually
- ❌ **Overkill for Most Web Apps**: Unnecessary complexity
- ❌ **Limited JavaScript Ecosystem**: Fewer tools

### Comparison Table

| Feature | JSON | PO (Gettext) | XLIFF | TOML (Current) |
|---------|------|--------------|-------|----------------|
| **Web App Native** | ✅ Best | ⚠️ Needs conversion | ❌ Complex | ⚠️ Rare |
| **i18next Support** | ✅ Excellent | ⚠️ Via plugin | ❌ Limited | ⚠️ Experimental |
| **Readability** | ✅ Good | ✅ Good | ❌ Verbose XML | ✅ Excellent |
| **Metadata/Context** | ⚠️ Limited | ✅ Excellent | ✅ Excellent | ⚠️ Limited |
| **Tooling Ecosystem** | ✅ Extensive | ✅ Mature | ✅ Professional | ❌ Minimal |
| **Plural Support** | ✅ Via i18next | ✅ Native | ✅ Native | ❌ No |
| **Namespace Support** | ✅ Native | ⚠️ Via files | ⚠️ Manual | ⚠️ Manual |
| **Performance** | ✅ Excellent | ⚠️ Build step | ❌ Parse heavy | ✅ Good |
| **Weblate Support** | ✅ Excellent | ✅ Excellent | ✅ Excellent | ⚠️ Experimental |

### Verdict: JSON + i18next

**For infinitechess.org, JSON with i18next is the clear choice:**
1. Modern JavaScript web application
2. Need for scalability and namespacing
3. Want industry-standard tooling
4. Benefit from automatic fallback
5. Easy integration with Weblate or similar TMS

---

## Recommended Approach

### Format: JSON with i18next

**Rationale**: Industry standard for modern web applications, excellent tooling, scalable structure.

### Structure: Namespaced by Feature

```
locales/
├── en/
│   ├── common.json          # Shared UI elements
│   ├── header.json          # Header/navigation
│   ├── game.json            # Game-specific strings
│   ├── menu.json            # Menu system
│   ├── member.json          # Member/profile pages
│   ├── news.json            # News articles metadata
│   ├── credits.json         # Credits page
│   └── terms.json           # Terms of service
├── es/
│   ├── common.json
│   ├── header.json
│   └── ...
├── de/
│   └── ...
└── ...
```

### Why Namespaces?

1. **Organization**: Logical grouping by feature/page
2. **Performance**: Lazy load only needed translations
3. **Scalability**: Easy to add new features without bloating files
4. **Team Collaboration**: Multiple translators work on different namespaces without conflicts
5. **Maintenance**: Easier to find and update related strings

### Migration from Current TOML

**Automated Conversion**:
```javascript
// conversion-script.js
// Read TOML structure like [header], [footer], [play.javascript]
// Map to namespaces: header.json, footer.json, game.json
// Preserve nested structures
// Generate JSON files per language
```

Example mapping:
```toml
# en-US.toml
[header]
home = "Infinite Chess"
play = "Play"
news = "News"

[play.javascript]
loading = "Loading..."
```

Becomes:
```json
// locales/en/header.json
{
  "home": "Infinite Chess",
  "play": "Play",
  "news": "News"
}

// locales/en/game.json
{
  "loading": "Loading..."
}
```

---

## Versioning Strategy

### Industry Standard: Git + Semantic Versioning

**How it works:**
1. **Source of Truth**: English JSON files in Git repository
2. **Version Tracking**: Git commits track all changes
3. **Semantic Tagging**: Tag releases (v2.0.0, v2.1.0, etc.)
4. **CI/CD Integration**: Automated detection of string changes

### Automated Workflow

```yaml
# .github/workflows/translations.yml
name: Translation Sync

on:
  push:
    paths:
      - 'locales/en/**'
  
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Detect changed strings
        run: |
          # Compare with previous commit
          git diff HEAD~1 HEAD -- locales/en/
      
      - name: Notify Weblate
        run: |
          # Webhook to Weblate to pull changes
          curl -X POST https://weblate.example.com/hooks/update/
      
      - name: Check translation completeness
        run: |
          # Validate all languages have all keys
          npm run validate-translations
```

### Handling New/Changed/Deleted Strings

#### New Strings Added
1. **Detection**: Git diff shows new keys in English JSON
2. **Automation**: CI/CD triggers TMS sync
3. **Translator Notification**: Weblate notifies translators of new strings
4. **Fallback**: Until translated, i18next returns English automatically
5. **Status Tracking**: Weblate shows "23 of 50 strings translated" per language

#### Strings Changed
1. **Detection**: Git diff shows modified values
2. **Mark as Fuzzy**: Weblate marks translation as "needs review"
3. **Translator Updates**: Translators review and update
4. **Fallback**: Old translation shown until updated (or use English if critical)

#### Strings Deleted
1. **Detection**: Git diff shows removed keys
2. **Cleanup**: Weblate automatically removes from all languages
3. **History**: Git history preserves old translations if needed

### No Custom Version Fields Needed

**Unlike current system**, no manual version tracking:
- ❌ No version field in each file
- ❌ No changes.json maintenance
- ❌ No custom removeOutdated() function
- ✅ Git commits are the version history
- ✅ i18next handles fallback automatically
- ✅ CI/CD automates the entire workflow

---

## Handling Incomplete Translations

### Industry Standard: Automatic Fallback Chain

**i18next built-in fallback** (no custom code needed):

```javascript
i18next.init({
  lng: 'fr-CA',  // User's preference: French Canadian
  fallbackLng: {
    'fr-CA': ['fr', 'en'],  // French Canadian falls back to French, then English
    'de-AT': ['de', 'en'],  // Austrian German falls back to German, then English
    'default': ['en']        // All other languages fall back to English
  }
});
```

### Three Approaches to Production

#### Approach 1: All Languages Available (Recommended)

**How it works:**
- All languages shown in language selector
- Missing strings automatically use English
- User sees mix of target language + English

**Example:**
```
French user with 70% complete translation:
- "Jouer" (translated)
- "Settings" (English fallback)
- "Profil" (translated)
```

**Pros:**
- ✅ Best user experience - users get partial translation immediately
- ✅ No language hidden from users
- ✅ Encourages community contribution when they see gaps
- ✅ Simpler deployment (no language filtering)

**Cons:**
- ⚠️ Mixed language experience for incomplete translations
- ⚠️ Need good UX to indicate translation status

**Used by:** GitHub, GitLab, Wikipedia, most modern web apps

#### Approach 2: Minimum Threshold (70-80%)

**How it works:**
- Language only shown when X% complete (e.g., 75%)
- Until threshold reached, not available to users
- Once available, uses fallback for remaining strings

**Pros:**
- ✅ Better quality control
- ✅ More consistent experience per language
- ✅ Avoids "too many gaps" feeling

**Cons:**
- ❌ Hides language from users until ready
- ❌ More complex deployment (need completion tracking)
- ❌ Discourages early community testing

**Used by:** Some commercial software, apps with strict branding requirements

#### Approach 3: Empty Strings (Not Recommended)

**How it works:**
- Missing translations show as empty/blank
- No automatic fallback to English

**Pros:**
- None really

**Cons:**
- ❌ Terrible user experience (broken UI)
- ❌ Confusing and unprofessional
- ❌ No one uses this approach

**Used by:** No one (anti-pattern)

### Recommendation: Approach 1 (All Languages, Automatic Fallback)

**Rationale:**
1. **Best UX**: Users immediately benefit from any translation progress
2. **Community Friendly**: Users can see what's translated and contribute
3. **Simpler Code**: i18next handles fallback automatically
4. **Industry Standard**: What most successful projects use
5. **Flexible**: Can always add threshold later if needed

**Implementation:**
```javascript
// Automatic with i18next - no custom code needed!
i18next.init({
  fallbackLng: 'en',
  // That's it! Missing translations automatically use English
});
```

### UI Indication of Translation Status

**Optional Enhancement** - Show translation completeness:

```jsx
// Language selector
<select>
  <option value="en">English (100%)</option>
  <option value="es">Español (95%)</option>
  <option value="fr">Français (78%) 🚧</option>
  <option value="de">Deutsch (45%) 🚧</option>
</select>
```

Or on language selection page:
```
French (Français) - 78% complete
Some content will be shown in English until translation is complete.
[Help translate →]
```

---

## Scalability Considerations

### 1. Namespace Strategy for Growth

**Start with logical splits:**
```
common.json      # Buttons, errors, general UI (most reused)
header.json      # Navigation, header elements
game.json        # Game-specific strings
menu.json        # Menus and controls
member.json      # User profiles and accounts
```

**As app grows, split further:**
```
game/
  ├── board.json       # Board rendering
  ├── pieces.json      # Piece names and moves
  ├── controls.json    # Game controls
  └── settings.json    # Game settings
```

### 2. Lazy Loading for Performance

**Load translations on demand:**

```javascript
// Only load translations for current page
router.beforeEach((to, from, next) => {
  const namespace = to.meta.i18nNamespace || 'common';
  i18next.loadNamespaces(namespace).then(() => next());
});
```

**Benefits:**
- Faster initial page load
- Reduce bandwidth for users
- Only download what's needed

### 3. Translation Memory & Reuse

**With TMS (Weblate/Crowdin/etc.):**
- Automatically suggests similar translations
- Reuses common phrases across the app
- Maintains consistency (e.g., "Save" always translated the same)

### 4. Plural Forms & Context

**i18next handles complex pluralization:**

```json
{
  "item": "item",
  "item_other": "items",
  "key": "You have {{count}} item",
  "key_other": "You have {{count}} items"
}
```

```javascript
t('key', { count: 1 });  // "You have 1 item"
t('key', { count: 5 });  // "You have 5 items"
```

**Context for disambiguation:**

```json
{
  "save": "Save",
  "save_game": "Save game",
  "save_settings": "Save settings"
}
```

### 5. CI/CD Integration

**Automated checks:**
```json
// package.json scripts
{
  "scripts": {
    "i18n:check": "node scripts/check-translations.js",
    "i18n:validate": "node scripts/validate-json.js",
    "i18n:sync": "node scripts/sync-weblate.js"
  }
}
```

**Pre-commit hooks:**
```yaml
# .husky/pre-commit
npm run i18n:validate
```

**CI pipeline:**
```yaml
# Check all languages have same keys as English
- name: Validate translations
  run: npm run i18n:check
  
# Fail build if critical namespaces incomplete
- name: Check critical translations
  run: |
    node scripts/check-critical.js common header game
```

---

## Implementation Plan

### Phase 1: Preparation (Before Design Overhaul)

#### 1.1 Setup New Structure
- [ ] Create `locales/` directory structure
- [ ] Set up namespaces (common, header, game, etc.)
- [ ] Install i18next and plugins

#### 1.2 Write Conversion Script
- [ ] Script to convert TOML → JSON
- [ ] Map TOML sections to namespaces
- [ ] Preserve nested structures
- [ ] Handle special cases (arrays, HTML, etc.)

#### 1.3 Test Environment
- [ ] Set up test instance with JSON translations
- [ ] Verify i18next integration
- [ ] Test fallback behavior
- [ ] Ensure all strings render correctly

### Phase 2: Migration (During Design Overhaul)

#### 2.1 Convert All Languages
- [ ] Run conversion script for all TOML files
- [ ] Review output for accuracy
- [ ] Manually verify edge cases
- [ ] Commit JSON files to repository

#### 2.2 Update Application Code
- [ ] Replace TOML loading with i18next
- [ ] Update all `t()` function calls to use namespaces
- [ ] Remove custom `removeOutdated()` function
- [ ] Update server-side translation handling

#### 2.3 Documentation
- [ ] Update TRANSLATIONS.md guide
- [ ] Create translator onboarding docs
- [ ] Document namespace conventions
- [ ] Add contribution examples

### Phase 3: TMS Integration (After Migration)

#### 3.1 Set Up Weblate (or similar)
- [ ] Deploy Weblate instance (Docker)
- [ ] Connect to Git repository
- [ ] Configure JSON component
- [ ] Set up webhooks for auto-sync

#### 3.2 Configure CI/CD
- [ ] Add translation validation to pipeline
- [ ] Set up automatic Weblate sync
- [ ] Configure completion threshold checks (if using)
- [ ] Add pre-commit hooks

#### 3.3 Onboard Translators
- [ ] Invite existing translators to TMS
- [ ] Provide training on new workflow
- [ ] Document both TMS and direct Git workflows
- [ ] Gather feedback and iterate

### Phase 4: Continuous Improvement

#### 4.1 Monitor & Optimize
- [ ] Track translation completion metrics
- [ ] Monitor fallback usage frequency
- [ ] Identify and split large namespaces if needed
- [ ] Optimize performance (lazy loading, etc.)

#### 4.2 Community Growth
- [ ] Make translation easy for new contributors
- [ ] Recognize and thank translators
- [ ] Regularly review and improve documentation
- [ ] Automate as much as possible

---

## Technical Architecture

### Directory Structure

```
infinitechess.org/
├── locales/                          # All translations
│   ├── en/                           # English (source)
│   │   ├── common.json
│   │   ├── header.json
│   │   ├── game.json
│   │   ├── menu.json
│   │   ├── member.json
│   │   ├── news.json
│   │   ├── credits.json
│   │   └── terms.json
│   ├── es/                           # Spanish
│   │   └── ...
│   ├── fr/                           # French
│   │   └── ...
│   └── de/                           # German
│       └── ...
├── src/
│   ├── client/
│   │   └── scripts/
│   │       └── i18n/
│   │           └── i18n.ts          # i18next setup
│   └── server/
│       └── config/
│           └── i18n.ts              # Server-side i18next
├── scripts/
│   ├── convert-toml-to-json.js      # Migration script
│   ├── check-translations.js        # Validation script
│   └── sync-weblate.js              # TMS integration
└── docs/
    ├── TRANSLATIONS.md               # Updated guide
    └── TRANSLATION-MIGRATION-STRATEGY.md  # This document
```

### i18next Configuration

**Client-side (Browser):**
```typescript
// src/client/scripts/i18n/i18n.ts
import i18next from 'i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18next
  .use(Backend)
  .use(LanguageDetector)
  .init({
    fallbackLng: 'en',
    fallbackNS: 'common',
    
    // Namespace configuration
    ns: ['common', 'header', 'game', 'menu', 'member'],
    defaultNS: 'common',
    
    // Backend configuration
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json'
    },
    
    // Detection configuration
    detection: {
      order: ['cookie', 'querystring', 'localStorage', 'navigator'],
      caches: ['cookie'],
      cookieName: 'i18next'
    },
    
    // Interpolation
    interpolation: {
      escapeValue: false // React already escapes
    }
  });

export default i18next;
```

**Server-side (Node.js):**
```typescript
// src/server/config/i18n.ts
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import { LanguageDetector } from 'i18next-http-middleware';

i18next
  .use(Backend)
  .use(LanguageDetector)
  .init({
    fallbackLng: 'en',
    preload: ['en', 'es', 'fr', 'de'], // Preload all languages
    
    ns: ['common', 'header', 'game', 'menu', 'member'],
    defaultNS: 'common',
    
    backend: {
      loadPath: './locales/{{lng}}/{{ns}}.json'
    }
  });

export default i18next;
```

**Usage in Code:**
```typescript
// With namespace
t('game:start_game')  // From game.json
t('common:save')      // From common.json

// Default namespace
t('save')  // From common.json (defaultNS)

// With interpolation
t('game:player_score', { score: 100 })  // "Player score: 100"

// With plurals
t('game:items', { count: 5 })  // "5 items"
```

### News Articles Handling

**Option 1: Markdown Files (Keep Current Approach)**
```
locales/
├── news/
│   ├── en/
│   │   ├── 2024-08-01.md
│   │   └── 2025-01-15.md
│   ├── es/
│   │   └── ...
│   └── ...
```

**Option 2: JSON with Markdown Content**
```json
// locales/en/news.json
{
  "2024-08-01": {
    "title": "Update 1.4 Released",
    "content": "Update 1.4 is released! There have been...",
    "date": "2024-08-01"
  }
}
```

**Recommendation:** Keep Option 1 (separate Markdown files)
- Easier to edit long-form content
- Better version control diffs
- Can still integrate with TMS as separate component

---

## Migration Checklist

### Pre-Migration

- [ ] Review all current translations
- [ ] Document any special cases or custom handling
- [ ] Back up current TOML files
- [ ] Create development branch for migration
- [ ] Set up test environment

### Conversion

- [ ] Write and test conversion script
- [ ] Convert English TOML to JSON namespaces
- [ ] Convert all other language TOMLs
- [ ] Validate JSON structure
- [ ] Spot-check random samples

### Code Updates

- [ ] Install i18next packages
- [ ] Set up i18next configuration (client & server)
- [ ] Update translation function calls
- [ ] Remove old TOML loading code
- [ ] Remove custom versioning/fallback logic
- [ ] Update EJS templates to use i18next
- [ ] Test all pages and features

### Testing

- [ ] Verify all English strings display correctly
- [ ] Test language switching
- [ ] Verify fallback behavior (incomplete languages)
- [ ] Test interpolation (variables in strings)
- [ ] Test pluralization
- [ ] Check performance (initial load, namespace loading)
- [ ] Test on all major pages/features

### Documentation

- [ ] Update README.md
- [ ] Rewrite TRANSLATIONS.md guide
- [ ] Document new structure and conventions
- [ ] Create migration notes for translators
- [ ] Update contributing guidelines

### Deployment

- [ ] Deploy to staging environment
- [ ] Full QA pass
- [ ] Gather feedback from team
- [ ] Deploy to production
- [ ] Monitor for issues

### Post-Migration

- [ ] Set up Weblate or TMS
- [ ] Configure CI/CD integration
- [ ] Onboard translators to new system
- [ ] Monitor translation completion
- [ ] Iterate on improvements

---

## Long-Term Maintenance

### Continuous Localization Workflow

```
Developer adds feature
    ↓
Extract new strings to English JSON
    ↓
Commit to Git
    ↓
CI/CD detects changes
    ↓
Weblate syncs automatically
    ↓
Translators notified
    ↓
Translations submitted
    ↓
Weblate commits back to Git
    ↓
CI/CD validates completeness
    ↓
Deploy to production
```

### Quality Assurance

**Automated:**
- JSON schema validation
- Key consistency checking (all languages have same keys)
- Interpolation variable validation
- Plural form completeness
- HTML tag matching

**Manual:**
- Spot-check translations for quality
- Review context when translator asks questions
- Test new features in multiple languages

### Metrics to Track

1. **Translation Completeness**
   - Percentage per language
   - Number of missing strings
   - Time to complete new strings

2. **Translator Activity**
   - Contributions per translator
   - Response time for new strings
   - Review/correction frequency

3. **User Impact**
   - Language usage statistics
   - Fallback frequency (how often English is used)
   - User language preferences

4. **Technical Health**
   - Build/validation failures
   - Sync errors with TMS
   - Performance metrics

### Best Practices

1. **Keep Common Namespace Small**: Only truly shared strings
2. **Meaningful Key Names**: `game.start_button` not `gb1`
3. **Consistent Naming**: Follow conventions across namespaces
4. **Comments in English JSON**: Help translators understand context
5. **Regular Reviews**: Periodically review and refactor
6. **Translator Recognition**: Thank and credit contributors
7. **Documentation**: Keep guides up to date
8. **Automation**: Automate everything possible

---

## Conclusion

### Summary

**Recommended Migration Path:**
1. **Format**: JSON with i18next (industry standard)
2. **Structure**: Namespaced by feature (scalable)
3. **Versioning**: Git commits + CI/CD automation (no custom code)
4. **Fallback**: Automatic via i18next (all languages available)
5. **Management**: Weblate integration (better translator UX)

### Why This Approach?

✅ **Industry Standard**: Used by most modern web applications  
✅ **Zero Custom Code**: i18next handles versioning and fallback  
✅ **Scalable**: Namespaces grow with application  
✅ **Automated**: CI/CD integration reduces manual work  
✅ **Better UX**: For both users and translators  
✅ **Future-Proof**: Extensive ecosystem and long-term support  

### Perfect Timing

**Website design overhaul = perfect migration opportunity:**
- No backward compatibility concerns
- Everything changing anyway
- Fresh start with best practices
- Set up for long-term success

### Next Steps

1. **Decision**: Confirm migration approach
2. **Planning**: Detailed timeline aligned with design overhaul
3. **Preparation**: Write conversion scripts, test environment
4. **Execution**: Migrate during redesign
5. **Optimization**: Continuous improvement post-launch

---

## Additional Resources

### Documentation
- [i18next Official Documentation](https://www.i18next.com/)
- [i18next Best Practices](https://www.i18next.com/principles/getting-started)
- [JSON Translation Best Practices](https://www.i18now.ai/blog/json-translation-files-best-practices-app-localization)
- [Weblate Documentation](https://docs.weblate.org/)

### Tools
- [i18next Scanner](https://github.com/i18next/i18next-scanner) - Extract strings from code
- [i18next Parser](https://github.com/i18next/i18next-parser) - Alternative extractor
- [Translation Check Script](https://github.com/i18next/i18next-translation-checker)

### Examples
- [i18next React Example](https://github.com/i18next/react-i18next)
- [Namespaces Guide](https://www.locize.com/docs/namespaces/)
- [CI/CD Translation Automation](https://circletranslations.com/blog/automated-translation-updates)

---

**Document Version**: 1.0  
**Date**: February 2026  
**Status**: Comprehensive Migration Strategy  
**For**: Website Design Overhaul

**Recommendation**: Proceed with JSON + i18next migration during website redesign.
