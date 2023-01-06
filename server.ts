import express from 'express';
import { createServer } from 'http';
import { PubSub } from 'graphql-subscriptions';
import gql from 'graphql-tag';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import bodyParser from 'body-parser'; //allows parsing of json files

// Asynchronous Anonymous Function 
    // server will be using await 

( async function () {
    // server code

    //publish and subscribe to events, enables to publish events to label and listen to events associated to that label
    const pubsub = new PubSub(); 
    const app = express();
    const httpServer = createServer(app);

    // Graph QL considered its own language, everything inside this tag can be written in typescript
    // TypeDefs
        // Product is the structure of the information posting/ listening to  
        // Query holds all different queries for the server
        // Mutation : creating the Product

    const typeDefs = gql`
        
        type Product { 
            title: String
            id: Int
            description: String

        }
        type Query {
            placeholder: Boolean
        }

        type Mutation {
            createProduct(title: String, id: Int, description: String): Product
        }

        type Subscription {
            newsfeed: Product
        }
    `

    // this is the objects used in the CreateProduct function
    interface createProductInput {
        title: string
        id: number
        description: string
    }


    // Resolvers, large object that defines queries, mutations and subscriptions 
        const resolvers = {
            Query: {
                placeholder: () => { return true }
            },
            Mutation: {
                createProduct: ( _parent: any, args: createProductInput ) => {
                   console.log(args);
                    pubsub.publish('EVENT_CREATED', { newsfeed: args }); //when creating Product, publish to EVENT_CREATED

                    //save Products to a database here (optional)
                   return args;
                }
            },
            Subscription: {
                newsfeed: {
                    //asyncIterator waits for a certain event to get triggered
                    subscribe: () => pubsub.asyncIterator(['EVENT_CREATED'])
                }
            }
        }

        // make schema that apollo server can use based of typedefs and resolvers previously defined
        const schema = makeExecutableSchema({typeDefs, resolvers});


        // start websocket server
        const wsServer = new WebSocketServer({
            server: httpServer,
            path: "/graphql"
        });

            
        const serverCleanup = useServer({ schema }, wsServer); //enables server cleanup (dispose)


        // create apollo server
        const server = new ApolloServer({
            schema,
            plugins: [
                ApolloServerPluginDrainHttpServer({ httpServer }),
                {
                    async serverWillStart() { //when the server starts will asyncronously dispose of the websocket server as well as the http server
                        return {
                            async drainServer(){
                                await serverCleanup.dispose();
                            }
                        }
                    }
                }
            ]
        });

        // start server 
        await server.start();

        // apply middlewares (cors, expressMiddlewares)
        app.use('/graphql', cors<cors.CorsRequest>(), bodyParser.json(), expressMiddleware(server) ) //applies apollo server to express server constructed in the beginning

        // http server start
        httpServer.listen(4000, () => {
            console.log("Server running on http://localhost:" + "4000" + "/graphql");
        });

})();

/*
    NOTE: 
        on the sandbox website, the connection settings should be as follows
        *  ENDPOINT: http://localhost:4000/graphql
        * subscription: ws://localhost:4000/graphql IMPLEMENTATION: graphql-ws
*/
