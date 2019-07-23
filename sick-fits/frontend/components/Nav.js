import Link from 'next/link';
import NavStyles from './styles/NavStyles';
import User from './User';
import Signout from './Signout';

const Nav = () => (
        <User >
            {({ data: { me } }) => (
                <NavStyles>
                    <Link href="/items">
                        <a>Shop</a>
                    </Link>

                    {me && (
                        <>
                            <Link href="/Sell">
                                <a>Sell</a>
                            </Link>


                            <Link href="/orders">
                                <a>Orders</a>
                            </Link>

                            <Link href="/account">
                                <a>Account</a>
                            </Link>

                            <Signout />
                        </>
                    )}
                    
                    {!me && (
                        <Link href="/signup">
                            <a>Signin</a>
                        </Link>
                    )}
                </NavStyles>
            )}
        </User>
)

export default Nav;