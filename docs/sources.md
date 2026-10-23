# Bringing data in from Puddle

Wellyboot BI charts data you have already cleaned in [Puddle](https://github.com/kevinmcaleer/puddle). Puddle has no server, so the data comes across as a file: export an Output node, then add the file to Wellyboot BI as a dataset.

## Export from Puddle

1. In Puddle, select the Output node whose table you want to chart.
2. Export it as **Parquet**. Parquet is the best choice: it keeps every column's type exactly as Puddle had it, it is small, and Wellyboot BI reads it without loading it all into memory.
3. CSV, TSV, JSON and NDJSON exports work too. Wellyboot BI reads them the way Puddle does, so column names and types come out the same, but a CSV carries no types, so dates and numbers are worked out again from the text.

Excel workbooks can't be added yet. Export Parquet instead.

## Add the dataset

Open a dashboard: the data source picker opens first. Choose **Add dataset**, then drop the file on the dialog, choose it, or paste an https address. An address only works when its server allows other sites to read the file (CORS); a Parquet file on a server that supports range requests is read a part at a time rather than downloaded whole.

Each dataset shows its fields with a type tag (number, text, date, time, date and time, or true or false), how many values are empty, how many are distinct, the smallest and largest, and for text the most common values.

When a Parquet file was exported by a version of Puddle that records where it came from, the panel also shows the Puddle project, the Output node, when it was exported, the files it read and the rules that passed. Wellyboot BI reads these from the file's `puddle.*` metadata keys: `puddle.project`, `puddle.node`, `puddle.exportedAt`, `puddle.sources` and `puddle.rulesPassed` (the last two as JSON).

## What is kept in your browser

Nothing is uploaded. A dataset's file is copied into this browser's private storage, so dashboards reopen without choosing it again.

- Files up to **500 MB** are copied. The limit is per dataset.
- A larger file isn't copied. In Chrome and Edge, Wellyboot BI keeps a link to the file instead, and after a reload asks once for permission to read it again (**Reconnect**). In Firefox and Safari you choose the file again after a reload.
- If the file you choose again doesn't start the way the original did, Wellyboot BI says so but uses it.

## Updating a dataset

When Puddle exports a newer version, use **Replace** on the dataset rather than adding it again. You'll see which columns were added, removed or changed type before anything is replaced. The dataset keeps its identity, so dashboards built on it keep working.

Renaming a dataset changes only its name in Wellyboot BI. Deleting it removes its copy from the browser too.
