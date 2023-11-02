import { Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import UserAgent from "user-agents";
 
declare var document: any;

const domain = "https://www.collinsdictionary.com";

export class WordForms {
  plural: string[] = [];
  comparative: string[] = [];
  superlative: string[] = [];
  thirdPersonSingularPresentTense: string[] = [];
  presentParticiple: string[] = [];
  pastTense: string[] = [];
  pastParticiple: string[] = [];
}

export class ScrapResult {
  constructor(public word: string, public pageType: PageType) { }
}

export class ScrapResultNegative extends ScrapResult {
  constructor(public word: string, public pageType: PageType, public reason: string ) {
    super(word, pageType);
  }
}

export class ScrapResultPositive extends ScrapResult {
  constructor(public word: string, public pageType: PageType, public wordForms: WordForms) {
    super(word, pageType);
  }
}

export class ScrapResultPositiveRedirected extends ScrapResultPositive {
  constructor(public word: string, public pageType: PageType, public wordForms: WordForms, public redirectedWord: string) {
    super(word, pageType, wordForms);
  }
}

export enum PageType {
  Dictionary,
  Conjugation,
}

export class ScrapRequest {
  constructor(public word: string, public pageType: PageType) { }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getWordFromCollinsUrl(url: string) {
  return url.match(/[/=]w+$/)?.[0] ?? "";
}

async function crawlDictionaryPage(word: string, page: Page, processRedirection = true) {
  console.log(`Going to dictionary page for word '${word}'...`);

  let redirected = false;
  const respose = await page.goto(`${domain}/dictionary/english/${encodeURIComponent(word.toLocaleLowerCase())}`, {});
  console.log(`'${page.url()}' finished loading`);
  const redirectChain = respose?.request().redirectChain();
  if (redirectChain?.length) {
    console.log(`Redirected through following urls: '${redirectChain.map((chainLink) => chainLink.url())}'`);

    if (!processRedirection) {
      console.log(`Returning since redirections are set to not be processed...`);
      return new ScrapResultNegative(word, PageType.Dictionary, "Redirected while having redirections set to not be processed");
    }
    redirected = true;
  }

  // NOTE: parameters passed to and returned by evaluate need to be json convertable
  console.log(`Crawling dictionary page for word '${word}'...`);
  let evaluateRes = await page.evaluate(async (wordForms) => {
    // Parses a form key from the text content of an element
    function parseFormKey(text: string) {
      if (text.startsWith(", ")) {
        text = text.substring(2);
      } else if (text.startsWith(" ")) {
        text = text.substring(1);
      }

      return {
        "plural": "plural",
        "comparative": "comparative",
        "superlative": "superlative",
        "3rd person singular present tense": "thirdPersonSingularPresentTense",
        "present participle": "presentParticiple",
        "past tense": "pastTense",
        "past participle": "pastParticiple",
      }[text];
    }

    // Parses a form value from the text content of an element
    function parseFormValue(text: string) {
      if (text.startsWith(", ")) {
        return text.substring(2);
      } else if (text.startsWith(" ")) {
        return text.substring(1);
      } else {
        return text;
      }
    }

    let results: (keyof WordForms)[] = [];
    const elem = document.querySelector(`.dictentry .inflected_forms`);
    if (elem?.children) {
      for (const child of elem.children) {
        if (child.classList.contains("type-gram")) {
          let formKey = child.textContent ? parseFormKey(child.textContent) : "";
          if (formKey) {
            // @ts-ignore
            results.push(formKey);
          }
        } else if (child.classList.contains("orth")) {
          for (const resultKey of results) {
            if (child.textContent) {
              wordForms[resultKey].push(parseFormValue(child.textContent));
            }
          }
          results = [];
        }
      }
      return { success: wordForms }
    } else if (document.querySelector('#challenge-running')?.textContent === "Checking if the site connection is secure"){
      return { failure: "Access to the page was blocked by Cloudfare" }
    } else {
      return { failure: "No entry exists for the given word" }
    }
  }, new WordForms()); // NOTE: we pass an empty WordForms because the function won't have access to the constructor where it's run

  const res = evaluateRes.success
    ? redirected
      ? new ScrapResultPositiveRedirected(word, PageType.Dictionary, evaluateRes.success, getWordFromCollinsUrl(page.url()))
      : new ScrapResultPositive(word, PageType.Dictionary, evaluateRes.success)
    : new ScrapResultNegative(word, PageType.Dictionary, evaluateRes.failure)

  return res;
}

async function crawlConjugationPage(word: string, page: Page, processRedirection = true) {
  console.log(`Going to conjugation page for word '${word}'...`);

  let redirected = false;
  const respose = await page.goto(`${domain}/conjugation/english/${encodeURIComponent(word)}`);
  console.log(`'${page.url()}' finished loading`);
  const redirectChain = respose?.request().redirectChain();
  // NOTE: we are redirected to spellcheck when attempting to access a non existant word
  if (redirectChain?.length) {
    console.log(`Redirected through following urls: '${redirectChain.map((chainLink) => chainLink.url())}'`);

    if (!processRedirection) {
      console.log(`Returning since redirections are set to not be processed...`);
      return new ScrapResultNegative(word, PageType.Conjugation, "Redirected while having redirections set to not be processed");
    }
    redirected = true;
  }
  
  // NOTE: parameters passed to and returned by evaluate need to be json convertable
  console.log(`Crawling dictionary page for word '${word}'...`);
  let evaluateRes = await page.evaluate((wordForms) => {
    if (document.querySelector('#challenge-running')?.textContent === "Checking if the site connection is secure"){
      return { failure: "Access to the page was blocked by Cloudfare" }
    }

    let elems = document.querySelectorAll(`.vC .type`);
    if (!elems.length) return { failure: "No entry exists for the given word" }

    for (const elem of elems) {
      if (elem.textContent?.startsWith("\nPast Participle")) {
        // Trim leading 'Past Participle'
        wordForms.pastParticiple = elem.textContent.substring(16).split(' or ');
      } else if (elem.textContent?.startsWith("\nPresent Participle")) {
        // Trim leading 'Present Participle'
        wordForms.presentParticiple = elem.textContent.substring(19).split(' or ');
      }
    }

    elems = document.querySelectorAll(`.short_verb_table .conjugation`);
    if (!elems.length) return { failure: "No entry exists for the given word" }

    for (const elem of elems) {
      if (elem.querySelector(`.h3_version`)?.textContent === "Present") {
        let inflElems = elem.querySelectorAll(`.infl`);
        for (const inflElem of inflElems) {
          if (inflElem.textContent.startsWith("he/she/it")) {
            // Trim leading 'he/she/it '
            wordForms.thirdPersonSingularPresentTense = [inflElem.textContent.substring(10)];
          }
        }
      } else if (elem.querySelector(`.h3_version`)?.textContent === "Past") {
        wordForms.pastTense = [elem.querySelector(`.infl`)?.childNodes?.[1].textContent];
      }
    }

    return { success: wordForms };
  }, new WordForms()); // NOTE: we pass an empty WordForms because the function won't have access to the constructor where it's run

  const res = evaluateRes.success
    ? redirected
      ? new ScrapResultPositiveRedirected(word, PageType.Conjugation, evaluateRes.success, getWordFromCollinsUrl(page.url()))
      : new ScrapResultPositive(word, PageType.Conjugation, evaluateRes.success)
    : new ScrapResultNegative(word, PageType.Conjugation, evaluateRes.failure)

  return res;
}

export async function scrap(requests: Iterable<ScrapRequest>, {
  processRedirections = true,
  defaultNavigationTimeout = 60000,
  sleepTimeBetweenRequests = 0,
}) {
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({ 
    // headless: false,
    headless: "new",
    ignoreHTTPSErrors: true,
   });
  const page = await browser.newPage();

  page.setDefaultNavigationTimeout(defaultNavigationTimeout);
  page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image') {
      await req.abort();
    }
    else {
      await req.continue(); 
    }
  });

  // NOTE: setting the user agent for the first page navigation avoids the cloudfare that would otherwise come up
  page.setUserAgent((new UserAgent()).toString());
  let results: ScrapResult[] = [];
  for (const req of requests) {
    let result: ScrapResult;
    try {
      switch (req.pageType) {
        case PageType.Dictionary:
          result = await crawlDictionaryPage(req.word, page, processRedirections);
          break;
        case PageType.Conjugation:
          result = await crawlConjugationPage(req.word, page, processRedirections);
          break;
        default: 
          result = new ScrapResultNegative(req.word, req.pageType, "The page type for the request is not a valid value");
          break;
      }
    } catch (err) {
      const reason = `${err}`
      console.error(reason);
      result = new ScrapResultNegative(req.word, req.pageType, reason);
    }
    results.push(result);
    if (0 < sleepTimeBetweenRequests) {
      await sleep(sleepTimeBetweenRequests);
    }
  }

  await page.close();
  await browser.close();
  console.log(`Done`);
  return results;
}