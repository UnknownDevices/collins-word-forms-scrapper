# Collins Word Forms Scrapper
A little script for scrapping word forms from the [Collins dictionary](https://www.collinsdictionary.com/) using [Puppeteer](https://github.com/puppeteer/puppeteer).

## Data scrapped
- Plurals for nouns (cactus -> cacti).
- Comparative and superlative for adjectives (sweet -> sweeter, sweetest).
- Third person singular present tense, present participle, past tense, and past participle for verbs (swim -> swims, - swimming, swam, swum).

Dictionary pages tend to contain all word forms while conjugation pages only contain verb forms. However, verb forms found in dictionary pages might not always be complete. For example, mislearn's dictionary page contains '-learns', '-learning', and '-learned', while mislearn's conjugation page containts 'mislearns', 'mislearning', and 'mislearned or mislearnt'.