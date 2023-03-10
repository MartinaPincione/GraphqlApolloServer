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
import { products } from './dataset';
import { argsToArgsConfig } from 'graphql/type/definition';


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
            name: String
            id: Int
            description: String

        }
        type Query {
            products: [Product]
            productByName(name: String): Product
            productById(id: Int): Product
        }

        type Mutation {
            addProduct(name: String, id: Int, description: String): Product
            deleteProduct(id: Int): Product
            updateProductDescription(id: Int, description: String): Product
        }

        type Subscription {
            user: UserSubscription!
        }

        type UserSubscription {
            mutation: String
            postFeed: Product
        }
    `

    // this is the objects used in the addProduct function
    interface addProductInput {
        name: string
        id: number
        description: string
    }


    // Resolvers, large object that defines queries, mutations and subscriptions 
        const resolvers = {
            Query: {
                products: () => products,
                productByName: (_: any, args: any) => {
                    return products.find((product) => product.name === args.name);
                },
                productById: (_:any, args: any) => {
                    return products.find((product) => product.id === args.id);
                }
            },
            Mutation: {
                addProduct: ( _parent: any, args: addProductInput ) => {
                   products.push(args);
                   //console.log(products);
                   pubsub.publish('USER', { 
                    user: {
                        mutation: "EVENT ADDED",
                        postFeed: args,
                   }}); //when creating Product, publish to EVENT_CREATED
                    //save Products to a database here (optional)
                   return args;
                },
                deleteProduct: (_parent: any, args: addProductInput) => {
                    const indexToDelete = products.findIndex( product => product.id === args.id);
                    if (indexToDelete === -1) {
                        throw new Error("This product does not exist, and therefore cannot be deleted.");
                    }
                    const productRemoved= products.splice(indexToDelete, 1);
                    pubsub.publish('USER', { 
                        user: {
                            mutation: "EVENT DELETED",
                            postFeed: productRemoved[0],
                         }});
                    return productRemoved;
                },
                updateProductDescription: (_parent: any, args: addProductInput) => {
                    const indexToAlter = products.findIndex( product => product.id === args.id);
                    if (indexToAlter === -1) throw new Error("This product does not exist, and therefore cannot be altered");
                    products[indexToAlter].description = args.description;
                    const changed = products[indexToAlter];
                    pubsub.publish('USER', { 
                        user: {
                            mutation: 'EVENT UPDATED',
                            postFeed: changed
                    }});
                    return changed;
                },
            },
            Subscription: {
                user: {
                    //asyncIterator waits for a certain event to get triggered
                    subscribe () {
                        return pubsub.asyncIterator(['USER']);
                    }
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
