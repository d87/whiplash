import gql from "graphql-tag"
import { ApolloClient, ApolloQueryResult } from "apollo-client"
import { HttpLink } from "apollo-link-http"
import { WebSocketLink } from 'apollo-link-ws'
import { ApolloLink, concat, split, FetchResult } from "apollo-link"
import { getMainDefinition } from 'apollo-utilities';
import { InMemoryCache, NormalizedCacheObject } from "apollo-cache-inmemory"
import { SubscriptionClient } from "subscriptions-transport-ws";
// import { getBearerToken } from "../auth/auth"
import { ITask, taskMerge } from "../components/Tasks/TaskActions"
import { ITaskEvent } from "../components/Timeline/Timeline"


import fetch from "cross-fetch"

import GetTasks from './GetTasks.gql'
import GetTaskEvents from './GetTaskEvents.gql'
import GetCurrentUserProfile from './GetCurrentUserProfile.gql'
import UpdateTasks from './subUpdateTasks.gql'
import EventLog from './subEventLog.gql'
import NewTask from './NewTask.gql'
import SaveTask from './SaveTask.gql'
import CompleteTask from './CompleteTask.gql'
import UncompleteTask from './UncompleteTask.gql'
import AddProgress from './AddProgress.gql'

// import { GetTasks, GetCurrentUserProfile, GetTaskEvents, UpdateTasks, EventLog, NewTask, SaveTask, CompleteTask, UncompleteTask, AddProgress } from './task_queries'

import config from "../config"

const isBrowser = typeof window !== "undefined"

// const authMiddlewareJWT = new ApolloLink((operation, forward) => {
//     // add the authorization to the headers
//     operation.setContext({
//         headers: {
//             authorization: getBearerToken() || null
//         }
//     })

//     return forward(operation)
// })

const authMiddlewareCookies = new ApolloLink((operation, forward) => {
    // add the authorization to the headers
    operation.setContext({
        // headers: {
        //     "Access-Control-Allow-Origin": "*"
        // },
        credentials: "include"
    })

    return forward(operation)
})




const httpLink = new HttpLink({
    uri: `${config.apiUrl}/api/graphql`,
    fetch,
    fetchOptions: {
        mode: 'no-cors',
    },
})
const authHttpLink = concat(authMiddlewareCookies, httpLink)

const forceCookieLink = (cookie) => new ApolloLink((operation, forward) => {
    operation.setContext({
        headers: {
            cookie: cookie,
        },
        credentials: "include"
    })

    return forward(operation)
})

let link
if (isBrowser) {
    const wsLink = new WebSocketLink({
        // document.location.host
        uri: `${config.websocketUrl}/api/subscriptions`,
        options: {
            reconnect: true,
            // reconnectionAttempts: 5
        }
    });

    // using the ability to split links, you can send data to each link
    // depending on what kind of operation is being sent
    link = split(
        // split based on operation type
        ({ query }) => {
          const { kind, operation } = getMainDefinition(query) as any;
          return kind === 'OperationDefinition' && operation === 'subscription';
        },
        wsLink,
        httpLink,
    );
} else {
    link = httpLink
}


// export const client = new ApolloClient({
//     link: link,
//     cache: new InMemoryCache(),
//     connectToDevTools: isBrowser,
//     ssrMode: !isBrowser
// })

let apolloClient: ApolloClient<NormalizedCacheObject> = null


function create (initialState, customCookie?: string): ApolloClient<NormalizedCacheObject> {
    let link2 = link
    if (customCookie) {
        link2 = concat(forceCookieLink(customCookie), link)
    }
    return new ApolloClient({
        link: link2,
        cache: new InMemoryCache().restore(initialState || {}),
        connectToDevTools: isBrowser,
        ssrMode: !isBrowser  // Disables forceFetch on the server (so queries are only run once)
    })
}

export function initApollo (initialState : object, customCookie?: string) {
    // Make sure to create a new client for every server-side request so that data
    // isn't shared between connections (which would be bad)
    if (!isBrowser) {
        apolloClient = create(initialState, customCookie)
        return apolloClient
    }

    // Reuse client on the client-side
    if (!apolloClient) {
        apolloClient = create(initialState)
    }

    return apolloClient
}

export const client = initApollo({})

export const getTasks = (): Promise<ApolloQueryResult<{ tasks: Array<Partial<ITask>> }>> => {
    return apolloClient.query({
        query: GetTasks
    })
}

export const getTaskEvents = (): Promise<ApolloQueryResult<{ taskEvents: ITaskEvent[] }>> => {
    return apolloClient.query({
        query: GetTaskEvents
    })
}

export const getCurrentUserProfile = (): Promise<ApolloQueryResult<{ user_profile: any }>> => {
    return apolloClient.query({
        query: GetCurrentUserProfile
    })
}


// https://github.com/apollographql/subscriptions-transport-ws
export const resetSubscriptionQuery = () => {
    return apolloClient.subscribe({
        query: UpdateTasks,
    })
}

export const subscribeToEventLog = (callback: (event: ITaskEvent) => any) => {
    return apolloClient.subscribe({
        query: EventLog,
    }).subscribe({
        next(message) {
            const event = message.data.eventLog
            return callback(event)
        },
        error(err) {
            console.error('err', err);
        },
    });
}

if (isBrowser) {


    //
    // const subscriptionObserver = subscribeToResets()
    // subscriptionObserver.subscribe({
    //     next(message) {
    //         const updatedTasks = message.data.updateTasks
    //         console.log("observer got data", updatedTasks)
    //         store.dispatch(taskMerge(updatedTasks))
    //     },
    //     error(err) { console.error('err', err); },
    // });
}

interface ITaskServerData {
    _id?: string
    title: string
    description: string
    dueDate: Date
    dueTime: number
    duration: number
    segmentDuration: number
    resetMode: string
    resetTime: number
    color: string
    priority: number
    isRecurring: boolean
}

export const createTask = (data: ITaskServerData): Promise<FetchResult<{ createTask: Partial<ITask> }>> => {
    const { title, description, dueTime, color, duration, segmentDuration, priority, isRecurring } = data
    const taskInput = { title, description, dueTime, color, duration, segmentDuration, priority, isRecurring }
    return apolloClient.mutate({
        mutation: NewTask,
        variables: { input: taskInput }
    })
}

export const saveTask = (data: ITaskServerData): Promise<FetchResult<{ saveTask: Partial<ITask> }>> => {
    const { _id, title, description, dueDate, dueTime, resetMode, resetTime, color, duration, segmentDuration, priority, isRecurring } = data
    const taskInput = { _id, title, description, dueDate, dueTime, resetMode, resetTime, color, duration, segmentDuration, priority, isRecurring }
    return apolloClient.mutate({
        mutation: SaveTask,
        variables: { input: taskInput }
    })
}

export const completeTask = (_id: string): Promise<FetchResult<{ completeTask: Partial<ITask> }>> => {
    return apolloClient.mutate({
        mutation: CompleteTask,
        variables: { id: _id }
    })
}

export const uncompleteTask = (_id: string): Promise<FetchResult<{ uncompleteTask: Partial<ITask> }>> => {
    return apolloClient.mutate({
        mutation: UncompleteTask,
        variables: { id: _id }
    })
}


export const addTaskProgress = (_id: string, progress: number): Promise<FetchResult<{ addProgress: Partial<ITask> }>> => {
    return apolloClient.mutate({
        mutation: AddProgress,
        variables: { id: _id, time: progress }
    })
}
