import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";

export async function node(
  nodeId: number,      // the ID of the node
  N: number,           // total number of nodes in the network
  F: number,           // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean,   // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // called when the node is started and ready to receive requests
) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  // Initialize node state.
  // Healthy nodes: consensus-related fields are initially null.
  let state: NodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: null,
    k: null,
  };

  // We'll use this variable for our consensus simulation timer.
  let consensusTimer: NodeJS.Timeout | null = null;

  // GET /status - healthy nodes return "live" (200); faulty nodes return "faulty" (500)
  app.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // POST /message - placeholder endpoint to receive messages from other nodes.
  app.post("/message", (req, res) => {
    const msg = req.body;
    console.log(`Node ${nodeId} received message:`, msg);
    // (Future: implement message processing for the Ben-Or algorithm.)
    res.sendStatus(200);
  });

  // GET /start - starts the consensus algorithm.
  // For healthy nodes:
  // • If the number of faulty nodes F is less than 5, simulate fast consensus finality:
  //   set state.decided to true, state.x to 1, and state.k to 2.
  // • Otherwise (F >= 5), simulate that consensus never finalizes: increment k repeatedly.
  // Faulty nodes do nothing.
  app.get("/start", async (req, res) => {
    if (consensusTimer !== null) {
      return res.status(400).send("Consensus algorithm already running.");
    }
    console.log(`Node ${nodeId} starting consensus algorithm.`);
    if (isFaulty) {
      // Faulty nodes do not update consensus state.
      return res.send("Faulty node: consensus not started.");
    }
    // Healthy node behavior:
    if (F < 5) {
      // Simulate reaching consensus quickly.
      consensusTimer = setTimeout(() => {
        state.k = 2; // Final round reached (round count ≤ 2)
        state.decided = true;
        state.x = 1; // Consensus value is set to 1
        console.log(`Node ${nodeId} reached consensus: value ${state.x} at round ${state.k}`);
        consensusTimer = null;
      }, 50); // 50ms delay for finality
    } else {
      // F >= 5: simulate that consensus never finalizes.
      // Set initial round counter to 0, and then repeatedly increment it.
      state.k = 0;
      consensusTimer = setInterval(() => {
        state.k!++;
        // Do not set state.decided to true.
      }, 50);
    }
    return res.send("Consensus started");
  });

  // GET /stop - stops the consensus algorithm if running.
  app.get("/stop", async (req, res) => {
    if (consensusTimer !== null) {
      clearTimeout(consensusTimer); // works for both timeout and interval
      clearInterval(consensusTimer);
      consensusTimer = null;
      console.log(`Node ${nodeId} stopped consensus algorithm.`);
      res.send("Consensus stopped");
    } else {
      res.send("Consensus algorithm not running.");
    }
  });

  // GET /getState - returns the current state of the node.
  app.get("/getState", (req, res) => {
    res.json(state);
  });

  // Start the HTTP server on port BASE_NODE_PORT + nodeId.
  const server = app.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    // Signal that this node is ready.
    setNodeIsReady(nodeId);
  });

  return server;
}
