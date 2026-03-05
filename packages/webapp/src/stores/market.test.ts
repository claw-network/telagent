import { beforeEach, describe, expect, it } from "vitest"

import { useConnectionStore } from "@/stores/connection"
import { useMarketStore } from "@/stores/market"

describe("useMarketStore", () => {
  beforeEach(() => {
    useMarketStore.setState({
      tasks: [],
      searchResults: [],
      bidsByTask: {},
      loadingTasks: false,
      loadingBids: false,
      error: undefined,
    })
  })

  it("refreshTasks normalizes and sorts task list", async () => {
    useConnectionStore.setState({
      sdk: {
        listTasks: async () => [
          { id: "task-1", title: "First", budget: 20 },
          { id: "task-2", title: "Second", budget: 50 },
        ],
      } as never,
    })

    await useMarketStore.getState().refreshTasks()

    const tasks = useMarketStore.getState().tasks
    expect(tasks.map((item) => item.id)).toEqual(["task-2", "task-1"])
  })

  it("getTaskById checks task list then search results", () => {
    useMarketStore.setState({
      tasks: [
        {
          id: "task-main",
          title: "Main",
          status: "open",
          raw: {},
        },
      ],
      searchResults: [
        {
          id: "task-search",
          title: "Search",
          status: "open",
          raw: {},
        },
      ],
    })

    const fromTasks = useMarketStore.getState().getTaskById("task-main")
    const fromSearch = useMarketStore.getState().getTaskById("task-search")

    expect(fromTasks?.title).toBe("Main")
    expect(fromSearch?.title).toBe("Search")
  })
})
