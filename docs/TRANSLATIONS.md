# Translation guide

This guide will walk you through the process of translating [InfiniteChess.org](https://www.infinitechess.org) into another language.

[← Back to README](../README.md) | [Setup Guide](./SETUP.md) | [Contributing Guide](./CONTRIBUTING.md) | [Translation Directory](../translation/) | [English TOML](../translation/en-US.toml) | [Changelog](../translation/changes.json) | [English News Posts](../translation/news/en-US/)

It is assumed you have already gone through the Setup Guide.

## Navigation

Anything that matters to you as a translator is located in the [translation](../translation/) directory. Translation files are stored in TOML format (you can read more about its syntax [here](https://toml.io/)). Generally, it is a very aproachable format, and you only need to understand the absolute basics of it, which are explained below.

## Translation files

### Name

Each file is named after its language [BCP 47 language tag](https://en.wikipedia.org/wiki/IETF_language_tag). BCP 47 tags are composed of this format (notice the capitalization):

`lng-(script)-REGION-(extensions)`

For example, `en-US` for American English, `sv` for Swedish, `zh-Hant-HK` for Chinese spoken in Hong Kong written in traditional script.

You should name your file this way and only this way, otherwise it won't be correctly detected.

### Content

Translation files in TOML format consist of keys, values, table headers and comments, like this:

```toml
[table-header]
# Comment
key1 = "value1"
key2 = "value2"
```

> [!IMPORTANT]
> **You should only change values. Please, leave everything else, including comments, unmodified when translating!**.

## Translation process

In case you are translating a language that is currently not present in the project, you can start the process by copying [en-US.toml](../translation/en-US.toml) and renaming it as described above. If you are updating an existing language, the only thing you need to do is to update the `version` variable at the top of your TOML document to the value of the `version` variable in [en-US.toml](../translation/en-US.toml), indicating that the translation is up to date.

> [!IMPORTANT]
> You should always use [en-US.toml](../translation/en-US.toml) as a reference. It is the only file that is up to date and comes straight from the developers. Do not use any other files!

Then you can start a test server with `npm run dev` and start translating. If you insert the address `https://localhost:3443` into your browser, the website should be there and it should automatically update as you make your changes (after reloading the page). Make sure that you have selected the language that you are editing in the settings in the top right.

In case you are updating an existing language and you aren't sure what has changed since the last update, you can view changes of `en-US.toml` in [the official changelog](../translation/changes.json) or in the [file commit history](https://github.com/Infinite-Chess/infinitechess.org/commits/main/translation/en-US.toml). In general, a translation is only considered up to date if the `version` variable on top matches the `version` value of the English TOML file.

> [!IMPORTANT]
> If there is an HTML tag in the value you want to translate, do not modify it!
>
> Example of an HTML tag:
>
> ```html
> <a href="https://www.google.com"> Hello World </a>
> ```
>
> In this example you should only change the words _Hello World_.

### Translating News Articles

In addition to the TOML translation files, you may optionally translate news articles located in the `translation/news/` directory, but this isn't required. Here are the steps to translate those:

1. **Make a copy of the [translation/news/en-US](../translation/news/en-US/) folder**: Rename it to your language's BCP 47 tag.

2. **Translate the content**: For each `.md` file within (e.g. `2024-09-11.md`), translate it from english into your language. Each news article supports [markdown](https://www.markdownguide.org/basic-syntax/), please don't modify hyperlinks, bullet points, headers indicated by `#`, or html tags (e.g. `<iframe>...</iframe>`).

3. **Commit your changes**: Once the translations are complete, commit the changes as you would with TOML files.

When you are finished, you should open a pull request as described in [SETUP.md](./SETUP.md).

---

## For Developers: TypeScript Type System

This section is for developers working with translations in the codebase.

### Overview

The project uses an automatic TypeScript type generation system that provides full autocomplete and type safety for translation keys. Types are automatically generated from `translation/en-US.toml` on every build.

### Type Generation

The type generation script (`scripts/generate-translation-types.ts`) creates two type structures:

1. **`TranslationKeys`** - Flat dot-notation union type for server-side i18next:

    ```typescript
    type TranslationKeys =
      | "play.javascript.termination.checkmate"
      | "header.home"
      | "play.play-menu.Classical"
      | ...502+ more keys
    ```

2. **`TranslationsObject`** - Nested object interface for client-side access:
    ```typescript
    interface TranslationsObject {
      play: {
        javascript: {
          termination: {
            checkmate: string;
            stalemate: string;
            ...
          };
          ...
        };
        ...
      };
      ...
    }
    ```

### Using Translation Types

#### Server-Side (i18next)

Use the typed `getTranslation()` function:

```typescript
import { getTranslation } from './server/utility/translate.js';

// Autocomplete works! Type: TranslationKeys | string
const message = getTranslation('play.javascript.termination.checkmate');

// Dynamic keys also work (no autocomplete but no errors)
const condition = 'stalemate';
const dynamicMessage = getTranslation(`play.javascript.termination.${condition}`);
```

#### Client-Side (Global Object)

The global `translations` object is automatically typed based on what EJS templates inject:

```typescript
// In client-side code, these have autocomplete:
const text1 = translations.lost_network;
const text2 = translations.failed_to_load;
```

### Regenerating Types

Types are automatically regenerated during:

- `npm run build` (production build)
- `npm run dev:build` (development build)
- `npm run generate:types` (manual generation)

### Adding New Translations

1. Add your translation keys to `translation/en-US.toml`
2. Update the version number in the TOML file
3. Document the change in `translation/changes.json`
4. Run `npm run generate:types` or start the dev server
5. Types are now available with autocomplete!

### Technical Details

- **Location**: Generated types are in `src/types/translations.ts`
- **Auto-generated**: Never edit this file manually - it's regenerated on every build
- **Index signatures**: Nested objects include `[key: string]: any` for dynamic property access
- **Special characters**: Keys with hyphens (e.g., `create-account`) are properly quoted in the type definitions

## Conclusion

Thank you for your contribution! In case of any trouble or questions, you can join [the discord](https://discord.gg/NFWFGZeNh5).
