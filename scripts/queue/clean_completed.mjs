#!/usr/bin/env node
import { cleanCompleted } from "./queue_lib.mjs";

console.log(`QUEUE_CLEANED ${cleanCompleted()}`);
