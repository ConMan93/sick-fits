const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');

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

        const item = await ctx.db.query.item({ where }, `{ id title }`);

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
    }
};

module.exports = Mutations;
