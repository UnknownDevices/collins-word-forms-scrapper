
import { readFile, writeFile } from "fs/promises";
import { scrap, ScrapRequest, PageType } from "../src/index";

async function run() {
  const words = (await readFile("test/words.txt", "utf-8")).split(",");
  function* generator() {
    for (const word of words) {
      yield new ScrapRequest(word, PageType.Dictionary);
      yield new ScrapRequest(word, PageType.Conjugation);
    }
  }
  
  scrap(generator(), {
    processRedirections: true,
    defaultNavigationTimeout: 120000,
    sleepTimeBetweenRequests: 0
  }).then((results) => {
    writeFile("test/output.json", JSON.stringify(results, null, 2)).catch(console.error);
  }).catch((err) => {
    console.error(err);
  })
}

run();