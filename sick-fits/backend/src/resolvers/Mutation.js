const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');
const { hasPermission } = require('../utils');
const stripe = require('../stripe');

const Mutations = {
    async createItem(parent, args, ctx, info) 
    {
        // TODO check if they are logged in
        if (!ctx.request.userId) {
            throw new Error('You must be logged in to do that!')
        }

        const item = await ctx.db.mutation.createItem({
            data: {
                // this is how we create a relationship between the item and the user
                user: {
                    connect: {
                        id: ctx.request.userId
                    }
                },
                ...args
            }
        }, info);

        return item;
    },

    updateItem(parent, args, ctx, info) 
    {
        // first take a cop of the updates
        const updates = { ...args };
        // remove the ID from the updates
        delete updates.id;
        // run the update method
        return ctx.db.mutation.updateItem({
            data: updates,
            where: {
                id: args.id
            }
        }, info);
    },

    async deleteItem(parent, args, ctx, info) 
    {
        const where = { id: args.id };

        const item = await ctx.db.query.item({ where }, `{ id title user { id } }`);

        const ownsItem = item.user.id === ctx.request.userId;
        const hasPermissions = ctx.request.user.permissions.some(permission => ['ADMIN', 'ITEMDELETE'].includes(permission));

        if (!ownsItem && !hasPermissions) {
            throw new Error("You don't have permission to do that");
        }

        return ctx.db.mutation.deleteItem({ where }, info);
    },

    async signup(parent, args, ctx, info) 
    {
        // Lower case their email so we don't run into authentication issues later
        args.email = args.email.toLowerCase();
        // Hash their password
        const password = await bcrypt.hash(args.password, 10);
        // Create the user in the database
        const user = await ctx.db.mutation.createUser({
            data: {
                ...args,
                password,
                permissions: { set: ['USER'] }
            }
        }, info)

        // Create a json web token for the user
        const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
        // Now we set the JWT as a cookie on the response
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365 // This is a year long cookie 
        });

        return user;
    },

    async signin(parent, { email, password }, ctx, info) {
        // 1. check if there is a user with that email 
        email = email.toLowerCase();
        const user = await ctx.db.query.user({ where: { email }})
        if(!user) {
            throw new Error(`No such user found for email: ${email}`)
        }
        // 2. check if their password is correct
        const valid = await bcrypt.compare(password, user.password)
        if(!valid) {
            throw new Error('Invalid Password!')
        }
        // 3. Generate the JWT token
        const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
        // 4. Set the cookie with the token
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365 // This is a year long cookie 
        });
        // 5. Return the user
        return user;
    },

    signout(parent, args, ctx, info) {
        ctx.response.clearCookie('token');
        return { message: 'Goodbye!' };
    },

    async requestReset(parent, args, ctx, info) {
        // 1. check if this is a real user
        email = args.email.toLowerCase();
        const user = await ctx.db.query.user({ where: { email } });

        if(!user) {
            throw new Error(`No such user found for email: ${args.email}`);
        }
        // 2. Set a reset token expiry on that user
        const randomBytesPromisified = await promisify(randomBytes);
        const resetToken = (await randomBytesPromisified(20)).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
        const res = await ctx.db.mutation.updateUser({ 
            where: { email },
            data: { resetToken, resetTokenExpiry }
        });
        // 3. Email them the reset token 
        const mailResponse = await transport.sendMail({
            from: 'connor@connorhoffman.com',
            to: user.email,
            subject: 'Reset Your SickFits Password',
            html: makeANiceEmail(`Follow this link to reset your password.
             \n\n <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset your password!</a> `)
        })


        return { message: 'Thanks!' };
    },

    async resetPassword(parent, args, ctx, info) {
        // 1. check if the passwords match
        if (args.password !== args.confirmPassword) {
            throw new Error('Passwords do not match');
        }
        // 2. check if it is a legit reset token
        // 3. check if the token is expired
        const [user] = await ctx.db.query.users({
            where: {
                resetToken: args.resetToken,
                resetTokenExpiry_gte: Date.now() - 3600000
            }
        });

        if(!user) {
            throw new Error('This token is either invalid or expired')
        };
        // 4. hash their new password
        const password = await bcrypt.hash(args.password, 10);
        // 5. save the new password to the user and remove the old resetToken fields
        const updatedUser = await ctx.db.mutation.updateUser({ 
            where: { email: user.email },
            data: {
                password,
                resetToken: null,
                resetTokenExpiry: null,
            }
         })
        // 6. generate jwt
        const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
        // 7. set the jwt cookie
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365
        });
        // 8. return the new user
        return updatedUser;
    },

    async updatePermissions(parent, args, ctx, info) {
        // first check if they are logged in
        if (!ctx.request.userId) {
            throw new Error('You must be logged in to do this!')
        };
        // query the current user
        const currentUser = await ctx.db.query.user({ where: { id: ctx.request.userId } }, info);
        // third check if they have permissions to do this
        hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE']);
        // update the permissions
        return ctx.db.mutation.updateUser({
            data: {
                permissions: {
                    set: args.permissions
                }
            },
            where: {
                id: args.userId
            },
        }, info);
    },

    async addToCart(parent, args, ctx, info) {
        // Make sure the user is signed in
        const userId = ctx.request.userId;
        if (!userId) {
            throw new Error('You must be signed in!')
        };
        // query the users current cart
        const [existingCartItem] = await ctx.db.query.cartItems({
            where: {
                user: { id: userId },
                item: { id: args.id }
            }
        })
        // Check if the item is already in the cart and increment by 1 if it is
        if (existingCartItem) {
            return ctx.db.mutation.updateCartItem({
                where: { id: existingCartItem.id },
                data: { quantity: existingCartItem.quantity + 1 },
            }, info);
        };
        // if it is not create a fresh cart item for that user
        return ctx.db.mutation.createCartItem({
            data: {
                user: {
                    connect: { id: userId },
                },
                item: {
                    connect: { id: args.id },
                }
            }
        }, info);
    },

    async removeFromCart(parent, args, ctx, info) {
        // find the cart item
        const cartItem = await ctx.db.query.cartItem({
            where: {
                id: args.id,
            }
        }, `{ id, user { id }}`);
        if (!cartItem) {
            throw new Error('No cart item found!')
        };
        // make sure they own the cart item
        if (cartItem.user.id !== ctx.request.userId) {
            throw new Error('You do not own this item')
        };
        // delete that cart item
        return ctx.db.mutation.deleteCartItem({
            where: {
                id: args.id
            }
        }, info);
    },

    async createOrder(parent, args, ctx, info) {
        // query the current user and make sure they are signed in
        const { userId } = ctx.request
        if (!userId) {
            throw new Error('You must be signed in to do this!')
        };
        const user = await ctx.db.query.user({
            where: { id: userId }
        }, `{ id name email cart { id quantity item { title price id description image largeImage } } }`);
        // recalculate the total for the price
        const amount = user.cart.reduce((tally, cartItem) => {
            return tally + cartItem.item.price * cartItem.quantity
        }, 0);
        // create the stripe charge 
        const charge = await stripe.charges.create({
            amount,
            currency: 'USD',
            source: args.token,
        });
        // convert the cart items to order items
        const orderItems = user.cart.map(cartItem => {
            const orderItem = {
                quantity: cartItem.quantity,
                user: { connect: { id: userId } },
                ...cartItem.item,
            }
            delete orderItem.id;
            return orderItem;
        });
        // create the order
        const order = await ctx.db.mutation.createOrder({
            data: {
                total: charge.amount,
                charge: charge.id,
                items: { create: orderItems },
                user: { connect: { id: userId } },
            }
        });
        // going to clear the users cart, delete cart items
        const cartItemIds = user.cart.map(cartItem => cartItem.id);
        await ctx.db.mutation.deleteManyCartItems({
            where: { 
                id_in: cartItemIds 
            },
        });
        // return the order to the client
        return order;
    }
};

module.exports = Mutations;
