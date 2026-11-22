---
"@dancrumb/cant-compiler": minor
"@dancrumb/cant-interpreter": minor
"@dancrumb/cant": minor
---

Add `IO::readline(stream?: ReadStream := @stdin): TEXT? raises StreamError` (ADR 0042). It reads the next line of a stream, decoded as UTF-8, without its `\n` or `\r\n`, and returns as soon as the line ends, so an interactive program can read answers as they are typed. It takes only the line from the stream, leaving the rest for later reads, and gives `NOTHING` once the stream has ended. A `FILE` gives its first line.
