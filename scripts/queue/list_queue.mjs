#!/usr/bin/env node
import { readQueue } from "./queue_lib.mjs";

console.log(JSON.stringify(readQueue(), null, 2));
