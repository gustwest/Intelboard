
import { signOut } from "@/auth"

export function SignOut() {
    return (
        <form
            action={async () => {
                "use server"
                await signOut()
            }}
        >
            <button type="submit" className="text-sm font-medium hover:underline text-gray-700">
                Sign Out
            </button>
        </form>
    )
}
